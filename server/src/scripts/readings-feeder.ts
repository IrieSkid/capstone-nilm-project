import express from 'express';
import { RowDataPacket } from 'mysql2';
import { z } from 'zod';

import { pool } from '../config/db';
import { env } from '../config/env';

interface FeederTargetRow extends RowDataPacket {
  device_id: number;
  device_identifier: string;
  device_name: string;
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
}

interface FeederPortRow extends RowDataPacket {
  device_port_id: number;
  device_port_device_id: number;
  device_port_label: string;
  device_port_supply_state: 'on' | 'off';
  appliance_type_id: number;
  appliance_type_name: string;
  appliance_type_typical_power_w: number;
  appliance_type_power_factor: number;
  appliance_type_nominal_frequency_hz: number;
  appliance_type_thd_reference: number;
  appliance_type_power_pattern: string;
  category_name: string;
}

interface ApplianceSlotState {
  devicePortId: number;
  applianceTypeId: number;
  applianceName: string;
  categoryName: string;
  powerPattern: string;
  typicalPowerW: number;
  powerFactor: number;
  nominalFrequencyHz: number;
  thdReference: number;
  portLabel: string;
  supplyState: 'on' | 'off';
  periodTicks: number;
  phaseOffset: number;
  amplitude: number;
}

interface ActiveApplianceReading {
  devicePortId: number;
  applianceTypeId: number;
  applianceName: string;
  categoryName: string;
  portLabel: string;
  powerPattern: string;
  supplyState: 'on' | 'off';
  powerW: number;
  current: number;
  powerFactor: number;
  frequency: number;
  thdPercentage: number;
}

interface TargetState {
  deviceId: number;
  deviceIdentifier: string;
  deviceName: string;
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  connectedAppliances: ApplianceSlotState[];
  tickCount: number;
  cumulativeEnergyKwh: number;
  lastPostedAt: string | null;
  lastReading: {
    timestamp: string;
    voltage: number;
    current: number;
    powerW: number;
    frequency: number;
    powerFactor: number;
    thdPercentage: number;
    energyKwh: number;
    estimatedCost: number;
    activeAppliances: ActiveApplianceReading[];
  } | null;
}

const startSchema = z.object({
  intervalMs: z.coerce.number().int().positive().optional(),
  deviceIdentifiers: z.array(z.string().trim().min(1)).optional(),
});

function round(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sineWave(tick: number, period: number, phaseOffset = 0) {
  return Math.sin(((tick + phaseOffset) / Math.max(period, 1)) * Math.PI * 2);
}

function nowIsoString() {
  const date = new Date();
  const timezoneOffsetMinutes = -date.getTimezoneOffset();
  const sign = timezoneOffsetMinutes >= 0 ? '+' : '-';
  const absoluteOffsetMinutes = Math.abs(timezoneOffsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, '0');
  const offsetMinutes = String(absoluteOffsetMinutes % 60).padStart(2, '0');

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

function parseJsonSafely(rawText: string) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function getApplianceBehavior(applianceName: string, portLabel: string) {
  const portIndex = Number(portLabel.replace(/\D/g, '')) || 1;

  const defaults = {
    periodTicks: 18,
    amplitude: 0.04,
  };

  const behavior = {
    'Air Conditioner': {
      periodTicks: 20,
      amplitude: 0.06,
    },
    'Electric Fan': {
      periodTicks: 16,
      amplitude: 0.03,
    },
    Refrigerator: {
      periodTicks: 14,
      amplitude: 0.08,
    },
    'Rice Cooker': {
      periodTicks: 18,
      amplitude: 0.04,
    },
    'LED TV': {
      periodTicks: 22,
      amplitude: 0.02,
    },
  }[applianceName] ?? defaults;

  return {
    periodTicks: behavior.periodTicks,
    amplitude: behavior.amplitude,
    phaseOffset: portIndex * 2,
  };
}

function mapPortRow(row: FeederPortRow): ApplianceSlotState {
  const behavior = getApplianceBehavior(row.appliance_type_name, row.device_port_label);

  return {
    devicePortId: row.device_port_id,
    applianceTypeId: row.appliance_type_id,
    applianceName: row.appliance_type_name,
    categoryName: row.category_name,
    powerPattern: row.appliance_type_power_pattern,
    typicalPowerW: row.appliance_type_typical_power_w,
    powerFactor: row.appliance_type_power_factor,
    nominalFrequencyHz: row.appliance_type_nominal_frequency_hz,
    thdReference: row.appliance_type_thd_reference,
    portLabel: row.device_port_label,
    supplyState: row.device_port_supply_state,
    periodTicks: behavior.periodTicks,
    phaseOffset: behavior.phaseOffset,
    amplitude: behavior.amplitude,
  };
}

function buildActiveApplianceReading(
  slot: ApplianceSlotState,
  tickCount: number,
  voltage: number,
  baseFrequency: number,
) {
  const activityWave = sineWave(tickCount, slot.periodTicks, slot.phaseOffset);
  const loadMultiplier = 1 + slot.amplitude * activityWave;
  const powerFactor = clamp(
    slot.powerFactor + activityWave * 0.02,
    0.55,
    0.99,
  );
  const thdPercentage = clamp(
    slot.thdReference + activityWave * Math.max(slot.thdReference * 0.08, 0.35),
    1,
    30,
  );
  const powerW = slot.typicalPowerW * loadMultiplier;
  const current = powerW / Math.max(voltage * powerFactor, 1);

  return {
    devicePortId: slot.devicePortId,
    applianceTypeId: slot.applianceTypeId,
    applianceName: slot.applianceName,
    categoryName: slot.categoryName,
    portLabel: slot.portLabel,
    powerPattern: slot.powerPattern,
    supplyState: slot.supplyState,
    powerW: round(powerW, 2),
    current: round(current, 3),
    powerFactor: round(powerFactor, 2),
    frequency: round(baseFrequency, 2),
    thdPercentage: round(thdPercentage, 2),
  };
}

function buildPayload(target: TargetState, intervalMs: number) {
  const nextTickCount = target.tickCount + 1;
  const timestamp = nowIsoString();
  const voltage = round(220 + sineWave(nextTickCount, 18, target.roomId) * 1.4, 2);
  const baseFrequency = round(
    60 + sineWave(nextTickCount, 22, target.roomId + 2) * 0.03,
    2,
  );

  const activeAppliances = target.connectedAppliances
    .filter((slot) => slot.supplyState === 'on')
    .map((slot) => buildActiveApplianceReading(slot, nextTickCount, voltage, baseFrequency));

  const powerW = round(
    activeAppliances.reduce((sum, appliance) => sum + appliance.powerW, 0),
    2,
  );
  const totalApparentPower = activeAppliances.reduce(
    (sum, appliance) => sum + appliance.powerW / Math.max(appliance.powerFactor, 0.1),
    0,
  );
  const powerFactor = totalApparentPower > 0
    ? round(powerW / totalApparentPower, 2)
    : 0;
  const current = round(
    totalApparentPower > 0 ? totalApparentPower / Math.max(voltage, 1) : 0,
    3,
  );
  const thdPercentage = round(
    activeAppliances.length > 0
      ? activeAppliances.reduce(
        (sum, appliance) => sum + appliance.thdPercentage * appliance.powerW,
        0,
      ) / Math.max(powerW, 1)
      : 0,
    2,
  );

  const energyIncrementKwh = (powerW / 1000) * (intervalMs / 3600000);
  const energyKwh = round(target.cumulativeEnergyKwh + energyIncrementKwh, 4);
  const estimatedCost = round(energyKwh * target.roomRatePerKwh, 2);

  target.tickCount = nextTickCount;
  target.cumulativeEnergyKwh = energyKwh;

  return {
    payload: {
      device_identifier: target.deviceIdentifier,
      timestamp,
      voltage,
      current,
      power_w: powerW,
      frequency: baseFrequency,
      power_factor: powerFactor,
      thd_percentage: thdPercentage,
      energy_kwh: energyKwh,
    },
    reading: {
      timestamp,
      voltage,
      current,
      powerW,
      frequency: baseFrequency,
      powerFactor,
      thdPercentage,
      energyKwh,
      estimatedCost,
      activeAppliances,
    },
  };
}

class ReadingsFeeder {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private targets = new Map<string, TargetState>();
  private lastTickAt: string | null = null;
  private cycleCount = 0;
  private recentResults: Array<{
    deviceIdentifier: string;
    roomName: string;
    activeAppliances: string[];
    powerW: number;
    estimatedCost: number;
    status: 'ok' | 'error';
    message: string;
    timestamp: string;
  }> = [];
  private selectedDeviceIdentifiers: string[] | null = null;
  private intervalMs = env.FEEDER_DEFAULT_INTERVAL_MS;

  get ingestUrl() {
    return env.FEEDER_INGEST_URL ?? `http://localhost:${env.PORT}${env.API_PREFIX}/readings/ingest`;
  }

  get running() {
    return this.timer !== null;
  }

  async refreshTargets() {
    const filter = this.selectedDeviceIdentifiers?.filter(Boolean) ?? [];
    const placeholders = filter.map(() => '?').join(', ');
    const whereClause = placeholders
      ? `WHERE d.device_identifier IN (${placeholders})`
      : '';

    const [rows] = await pool.query<FeederTargetRow[]>(
      `
        SELECT
          d.device_id,
          d.device_identifier,
          d.device_name,
          room.room_id,
          room.room_name,
          room.room_rate_per_kwh
        FROM tbldevices d
        INNER JOIN tblrooms room ON room.room_device_id = d.device_id
        ${whereClause}
        ORDER BY room.room_id
      `,
      filter,
    );

    const deviceIds = rows.map((row) => row.device_id);
    const portPlaceholders = deviceIds.map(() => '?').join(', ');
    const [portRows] = deviceIds.length > 0
      ? await pool.query<FeederPortRow[]>(
        `
          SELECT
            dp.device_port_id,
            dp.device_port_device_id,
            dp.device_port_label,
            dp.device_port_supply_state,
            ap.appliance_type_id,
            ap.appliance_type_name,
            ap.appliance_type_typical_power_w,
            ap.appliance_type_power_factor,
            ap.appliance_type_nominal_frequency_hz,
            ap.appliance_type_thd_reference,
            ap.appliance_type_power_pattern,
            cat.category_name
          FROM tbldevice_ports dp
          INNER JOIN tblappliance_types ap ON ap.appliance_type_id = dp.device_port_appliance_type_id
          INNER JOIN tblappliance_categories cat ON cat.category_id = ap.appliance_type_category_id
          WHERE dp.device_port_device_id IN (${portPlaceholders})
          ORDER BY dp.device_port_device_id, dp.device_port_label
        `,
        deviceIds,
      )
      : [[] as FeederPortRow[]];

    const portsByDeviceId = new Map<number, ApplianceSlotState[]>();

    for (const row of portRows) {
      const slots = portsByDeviceId.get(row.device_port_device_id) ?? [];
      slots.push(mapPortRow(row));
      portsByDeviceId.set(row.device_port_device_id, slots);
    }

    const nextTargets = new Map<string, TargetState>();

    for (const row of rows) {
      const existingTarget = this.targets.get(row.device_identifier);

      nextTargets.set(row.device_identifier, {
        deviceId: row.device_id,
        deviceIdentifier: row.device_identifier,
        deviceName: row.device_name,
        roomId: row.room_id,
        roomName: row.room_name,
        roomRatePerKwh: row.room_rate_per_kwh,
        connectedAppliances: portsByDeviceId.get(row.device_id) ?? [],
        tickCount: existingTarget?.tickCount ?? 0,
        cumulativeEnergyKwh: existingTarget?.cumulativeEnergyKwh ?? round(6 + row.room_id * 1.75, 4),
        lastPostedAt: existingTarget?.lastPostedAt ?? null,
        lastReading: existingTarget?.lastReading ?? null,
      });
    }

    this.targets = nextTargets;
    return this.getTargets();
  }

  async start(input?: z.infer<typeof startSchema>) {
    const parsedInput = startSchema.parse(input ?? {});

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.intervalMs = parsedInput.intervalMs ?? env.FEEDER_DEFAULT_INTERVAL_MS;
    this.selectedDeviceIdentifiers = parsedInput.deviceIdentifiers ?? null;
    await this.refreshTargets();

    if (this.targets.size === 0) {
      throw new Error('No room-assigned devices are available for the feeder.');
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    await this.tick();
    return this.getStatus();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    return this.getStatus();
  }

  async tick() {
    if (this.ticking) {
      return this.getStatus();
    }

    this.ticking = true;

    try {
      await this.refreshTargets();

      const targets = Array.from(this.targets.values());

      await Promise.all(
        targets.map(async (target) => {
          const { payload, reading } = buildPayload(target, this.intervalMs);

          try {
            const response = await fetch(this.ingestUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            });

            const rawText = await response.text();
            const parsed = parseJsonSafely(rawText);

            if (!response.ok) {
              throw new Error(parsed?.message || 'Feeder ingest failed.');
            }

            target.lastPostedAt = payload.timestamp;
            target.lastReading = reading;

            this.pushResult({
              deviceIdentifier: target.deviceIdentifier,
              roomName: target.roomName,
              activeAppliances: reading.activeAppliances.map(
                (appliance) => `${appliance.portLabel}:${appliance.applianceName}`,
              ),
              powerW: reading.powerW,
              estimatedCost: parsed?.data?.estimatedCost ?? reading.estimatedCost,
              status: 'ok',
              message: 'Reading fed successfully.',
              timestamp: payload.timestamp,
            });
          } catch (error) {
            this.pushResult({
              deviceIdentifier: target.deviceIdentifier,
              roomName: target.roomName,
              activeAppliances: reading.activeAppliances.map(
                (appliance) => `${appliance.portLabel}:${appliance.applianceName}`,
              ),
              powerW: reading.powerW,
              estimatedCost: reading.estimatedCost,
              status: 'error',
              message: error instanceof Error ? error.message : 'Unknown feeder error.',
              timestamp: payload.timestamp,
            });
          }
        }),
      );

      this.cycleCount += 1;
      this.lastTickAt = new Date().toISOString();
      return this.getStatus();
    } finally {
      this.ticking = false;
    }
  }

  getTargets() {
    return Array.from(this.targets.values()).map((target) => ({
      deviceId: target.deviceId,
      deviceIdentifier: target.deviceIdentifier,
      deviceName: target.deviceName,
      roomId: target.roomId,
      roomName: target.roomName,
      roomRatePerKwh: target.roomRatePerKwh,
      connectedAppliances: target.connectedAppliances.map((appliance) => ({
        devicePortId: appliance.devicePortId,
        applianceTypeId: appliance.applianceTypeId,
        applianceName: appliance.applianceName,
        categoryName: appliance.categoryName,
        portLabel: appliance.portLabel,
        powerPattern: appliance.powerPattern,
        supplyState: appliance.supplyState,
      })),
      tickCount: target.tickCount,
      cumulativeEnergyKwh: target.cumulativeEnergyKwh,
      lastPostedAt: target.lastPostedAt,
      lastReading: target.lastReading,
    }));
  }

  getStatus() {
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      ingestUrl: this.ingestUrl,
      cycleCount: this.cycleCount,
      lastTickAt: this.lastTickAt,
      targetCount: this.targets.size,
      targets: this.getTargets(),
      recentResults: this.recentResults,
    };
  }

  private pushResult(result: {
    deviceIdentifier: string;
    roomName: string;
    activeAppliances: string[];
    powerW: number;
    estimatedCost: number;
    status: 'ok' | 'error';
    message: string;
    timestamp: string;
  }) {
    this.recentResults = [result, ...this.recentResults].slice(0, 20);
  }
}

const feeder = new ReadingsFeeder();
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    message: 'Readings feeder is running.',
    data: feeder.getStatus(),
  });
});

app.get('/status', (_req, res) => {
  res.json({
    data: feeder.getStatus(),
  });
});

app.get('/targets', async (_req, res, next) => {
  try {
    const targets = await feeder.refreshTargets();
    res.json({
      data: targets,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/start', async (req, res, next) => {
  try {
    const status = await feeder.start(req.body);
    res.json({
      message: 'Feeder started successfully.',
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/tick', async (_req, res, next) => {
  try {
    const status = await feeder.tick();
    res.json({
      message: 'Feeder tick completed.',
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/stop', (_req, res) => {
  const status = feeder.stop();
  res.json({
    message: 'Feeder stopped.',
    data: status,
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Feeder error:', error);

  res.status(400).json({
    message: error instanceof Error ? error.message : 'Feeder request failed.',
  });
});

async function bootstrap() {
  await pool.query('SELECT 1');

  app.listen(env.FEEDER_PORT, () => {
    console.log(`Readings feeder listening on http://localhost:${env.FEEDER_PORT}`);
    console.log(`Target ingest URL: ${feeder.ingestUrl}`);

    if (env.FEEDER_AUTOSTART) {
      console.log(`Autostart enabled. Feeding room-assigned devices every ${env.FEEDER_DEFAULT_INTERVAL_MS} ms.`);

      void feeder.start({ intervalMs: env.FEEDER_DEFAULT_INTERVAL_MS })
        .then((status) => {
          console.log(`Feeder started automatically for ${status.targetCount} target device(s).`);
        })
        .catch((error) => {
          console.error('Feeder autostart failed.', error);
        });
    }
  });
}

async function shutdown() {
  feeder.stop();
  await pool.end();
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

bootstrap().catch((error) => {
  console.error('Failed to start readings feeder.', error);
  process.exit(1);
});

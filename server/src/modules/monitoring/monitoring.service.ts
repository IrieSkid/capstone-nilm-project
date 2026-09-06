import { RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { env } from '../../config/env';
import { AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { assertRoomAccess } from '../../shared/utils/room-access';
import { getDurationSecondsSince } from '../../shared/utils/date';
import { MonitoringRange } from './monitoring.schemas';

interface MonitoringRoomRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
  device_id: number | null;
  device_name: string | null;
  device_identifier: string | null;
  device_last_seen: string | null;
  computed_status: 'online' | 'offline' | null;
  reading_header_time: string | null;
  reading_detail_power_w: number | null;
  reading_detail_energy_kwh: number | null;
}

interface ReadingSampleRow extends RowDataPacket {
  reading_header_time: string;
  reading_detail_voltage: number;
  reading_detail_current: number;
  reading_detail_power_w: number;
  reading_detail_frequency: number;
  reading_detail_power_factor: number;
  reading_detail_energy_kwh: number;
}

interface ReadingStatisticsRow extends RowDataPacket {
  sample_count: number;
  first_reading_at: string | null;
  last_reading_at: string | null;
  average_voltage: number | null;
  minimum_voltage: number | null;
  maximum_voltage: number | null;
  average_current: number | null;
  maximum_current: number | null;
  average_power_w: number | null;
  peak_power_w: number | null;
  average_power_factor: number | null;
  average_frequency: number | null;
}

interface EnergyBoundaryRow extends RowDataPacket {
  reading_header_time: string;
  reading_detail_energy_kwh: number;
}

interface DeviceHeartbeatRow extends RowDataPacket {
  heartbeat_device_time: string | null;
  heartbeat_uptime_seconds: number;
  heartbeat_wifi_rssi_dbm: number | null;
  heartbeat_pzem_ok: number;
  heartbeat_last_reading_http_status: number | null;
  heartbeat_firmware_version: string;
  heartbeat_error_code: string | null;
  heartbeat_received_at: string;
}

interface ReadingQualityRow extends RowDataPacket {
  sample_count: number;
  first_reading_at: string | null;
  last_reading_at: string | null;
  observed_span_seconds: number | null;
}

interface ReadingGapRow extends RowDataPacket {
  average_interval_seconds: number | null;
  longest_gap_seconds: number | null;
  gap_count: number;
}

const RANGE_CONFIG: Record<MonitoringRange, {
  whereSql: string;
  bucketSeconds: number | null;
  limit: number;
}> = {
  live: { whereSql: '', bucketSeconds: null, limit: 120 },
  '1h': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)', bucketSeconds: 30, limit: 240 },
  '24h': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)', bucketSeconds: 300, limit: 400 },
  '7d': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)', bucketSeconds: 3600, limit: 240 },
  '30d': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)', bucketSeconds: 21600, limit: 160 },
};

const QUALITY_RANGE_CONFIG: Record<MonitoringRange, {
  whereSql: string;
  windowSeconds: number;
}> = {
  live: { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)', windowSeconds: 300 },
  '1h': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)', windowSeconds: 3600 },
  '24h': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)', windowSeconds: 86_400 },
  '7d': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)', windowSeconds: 604_800 },
  '30d': { whereSql: 'AND h.reading_header_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)', windowSeconds: 2_592_000 },
};

function round(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function mapSample(row: ReadingSampleRow) {
  return {
    timestamp: row.reading_header_time,
    voltage: round(row.reading_detail_voltage),
    current: round(row.reading_detail_current, 3),
    powerW: round(row.reading_detail_power_w),
    apparentPowerVa: round(row.reading_detail_voltage * row.reading_detail_current),
    frequency: round(row.reading_detail_frequency),
    powerFactor: round(row.reading_detail_power_factor),
    energyKwh: round(row.reading_detail_energy_kwh, 4),
  };
}

function roomAccessClause(user: AuthenticatedUser) {
  if (user.roleName === 'admin') {
    return { sql: '', values: [] as number[] };
  }

  if (user.roleName === 'landlord') {
    return { sql: 'WHERE room.room_landlord_id = ?', values: [user.userId] };
  }

  return { sql: 'WHERE room.room_tenant_id = ?', values: [user.userId] };
}

export async function listMonitoringRooms(user: AuthenticatedUser) {
  const access = roomAccessClause(user);
  const [rows] = await pool.query<MonitoringRoomRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        device.device_id,
        device.device_name,
        device.device_identifier,
        device.device_last_seen,
        CASE
          WHEN device.device_id IS NULL THEN NULL
          WHEN device.device_status = 'online'
            AND device.device_last_seen IS NOT NULL
            AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? SECOND)
          THEN 'online'
          ELSE 'offline'
        END AS computed_status,
        latest_header.reading_header_time,
        latest_detail.reading_detail_power_w,
        latest_detail.reading_detail_energy_kwh
      FROM tblrooms room
      LEFT JOIN tbldevices device ON device.device_id = room.room_device_id
      LEFT JOIN tblreading_headers latest_header
        ON latest_header.reading_header_id = (
          SELECT h.reading_header_id
          FROM tblreading_headers h
          WHERE h.reading_header_room_id = room.room_id
          ORDER BY h.reading_header_time DESC, h.reading_header_id DESC
          LIMIT 1
        )
      LEFT JOIN tblreading_details latest_detail
        ON latest_detail.reading_detail_header_id = latest_header.reading_header_id
      ${access.sql}
      ORDER BY room.room_name
    `,
    [env.MONITORING_OFFLINE_SECONDS, ...access.values],
  );

  return rows.map((row) => ({
    roomId: row.room_id,
    roomName: row.room_name,
    roomStatus: row.room_status,
    ratePerKwh: row.room_rate_per_kwh,
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceIdentifier: row.device_identifier,
    deviceStatus: row.computed_status ?? 'unassigned',
    deviceLastSeen: row.device_last_seen,
    latestReadingAt: row.reading_header_time,
    latestPowerW: round(row.reading_detail_power_w),
    latestEnergyKwh: round(row.reading_detail_energy_kwh, 4),
  }));
}

async function getMonitoringRoom(user: AuthenticatedUser, roomId: number) {
  await assertRoomAccess(user, roomId);

  const [rooms] = await pool.query<MonitoringRoomRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        device.device_id,
        device.device_name,
        device.device_identifier,
        device.device_last_seen,
        CASE
          WHEN device.device_id IS NULL THEN NULL
          WHEN device.device_status = 'online'
            AND device.device_last_seen IS NOT NULL
            AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? SECOND)
          THEN 'online'
          ELSE 'offline'
        END AS computed_status,
        NULL AS reading_header_time,
        NULL AS reading_detail_power_w,
        NULL AS reading_detail_energy_kwh
      FROM tblrooms room
      LEFT JOIN tbldevices device ON device.device_id = room.room_device_id
      WHERE room.room_id = ?
      LIMIT 1
    `,
    [env.MONITORING_OFFLINE_SECONDS, roomId],
  );

  const row = rooms[0];

  if (!row) {
    throw new AppError(404, 'Monitoring room not found.');
  }

  return {
    roomId: row.room_id,
    roomName: row.room_name,
    roomStatus: row.room_status,
    ratePerKwh: row.room_rate_per_kwh,
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceIdentifier: row.device_identifier,
    deviceStatus: row.computed_status ?? 'unassigned',
    deviceLastSeen: row.device_last_seen,
  };
}

async function getLatestSample(roomId: number) {
  const [rows] = await pool.query<ReadingSampleRow[]>(
    `
      SELECT
        h.reading_header_time,
        d.reading_detail_voltage,
        d.reading_detail_current,
        d.reading_detail_power_w,
        d.reading_detail_frequency,
        d.reading_detail_power_factor,
        d.reading_detail_energy_kwh
      FROM tblreading_headers h
      INNER JOIN tblreading_details d
        ON d.reading_detail_header_id = h.reading_header_id
      WHERE h.reading_header_room_id = ?
      ORDER BY h.reading_header_time DESC, h.reading_header_id DESC
      LIMIT 1
    `,
    [roomId],
  );

  return rows[0] ? mapSample(rows[0]) : null;
}

async function getHistory(roomId: number, range: MonitoringRange) {
  const config = RANGE_CONFIG[range];

  if (config.bucketSeconds === null) {
    const [rows] = await pool.query<ReadingSampleRow[]>(
      `
        SELECT
          h.reading_header_time,
          d.reading_detail_voltage,
          d.reading_detail_current,
          d.reading_detail_power_w,
          d.reading_detail_frequency,
          d.reading_detail_power_factor,
          d.reading_detail_energy_kwh
        FROM tblreading_headers h
        INNER JOIN tblreading_details d
          ON d.reading_detail_header_id = h.reading_header_id
        WHERE h.reading_header_room_id = ?
        ORDER BY h.reading_header_time DESC, h.reading_header_id DESC
        LIMIT ?
      `,
      [roomId, config.limit],
    );

    return rows.reverse().map(mapSample);
  }

  const [rows] = await pool.query<ReadingSampleRow[]>(
    `
      SELECT
        FROM_UNIXTIME(
          FLOOR(UNIX_TIMESTAMP(h.reading_header_time) / ?) * ?
        ) AS reading_header_time,
        AVG(d.reading_detail_voltage) AS reading_detail_voltage,
        AVG(d.reading_detail_current) AS reading_detail_current,
        AVG(d.reading_detail_power_w) AS reading_detail_power_w,
        AVG(d.reading_detail_frequency) AS reading_detail_frequency,
        AVG(d.reading_detail_power_factor) AS reading_detail_power_factor,
        MAX(d.reading_detail_energy_kwh) AS reading_detail_energy_kwh
      FROM tblreading_headers h
      INNER JOIN tblreading_details d
        ON d.reading_detail_header_id = h.reading_header_id
      WHERE h.reading_header_room_id = ?
        ${config.whereSql}
      GROUP BY FLOOR(UNIX_TIMESTAMP(h.reading_header_time) / ?)
      ORDER BY reading_header_time ASC
      LIMIT ?
    `,
    [config.bucketSeconds, config.bucketSeconds, roomId, config.bucketSeconds, config.limit],
  );

  return rows.map(mapSample);
}

async function getStatistics(roomId: number, range: MonitoringRange) {
  const config = RANGE_CONFIG[range];
  const [rows] = await pool.query<ReadingStatisticsRow[]>(
    `
      SELECT
        COUNT(*) AS sample_count,
        MIN(h.reading_header_time) AS first_reading_at,
        MAX(h.reading_header_time) AS last_reading_at,
        AVG(d.reading_detail_voltage) AS average_voltage,
        MIN(d.reading_detail_voltage) AS minimum_voltage,
        MAX(d.reading_detail_voltage) AS maximum_voltage,
        AVG(d.reading_detail_current) AS average_current,
        MAX(d.reading_detail_current) AS maximum_current,
        AVG(d.reading_detail_power_w) AS average_power_w,
        MAX(d.reading_detail_power_w) AS peak_power_w,
        AVG(d.reading_detail_power_factor) AS average_power_factor,
        AVG(d.reading_detail_frequency) AS average_frequency
      FROM tblreading_headers h
      INNER JOIN tblreading_details d
        ON d.reading_detail_header_id = h.reading_header_id
      WHERE h.reading_header_room_id = ?
        ${config.whereSql}
    `,
    [roomId],
  );

  return rows[0];
}

async function getLatestHeartbeat(deviceId: number | null) {
  if (deviceId === null) {
    return null;
  }

  const [rows] = await pool.query<DeviceHeartbeatRow[]>(
    `
      SELECT
        heartbeat_device_time,
        heartbeat_uptime_seconds,
        heartbeat_wifi_rssi_dbm,
        heartbeat_pzem_ok,
        heartbeat_last_reading_http_status,
        heartbeat_firmware_version,
        heartbeat_error_code,
        heartbeat_received_at
      FROM tbldevice_heartbeats
      WHERE heartbeat_device_id = ?
      ORDER BY heartbeat_received_at DESC, heartbeat_id DESC
      LIMIT 1
    `,
    [deviceId],
  );

  return rows[0] ?? null;
}

async function getReadingQuality(roomId: number, range: MonitoringRange) {
  const config = QUALITY_RANGE_CONFIG[range];
  const expectedIntervalSeconds = env.EXPECTED_READING_INTERVAL_SECONDS;
  const [qualityRows] = await pool.query<ReadingQualityRow[]>(
    `
      SELECT
        COUNT(*) AS sample_count,
        MIN(h.reading_header_time) AS first_reading_at,
        MAX(h.reading_header_time) AS last_reading_at,
        TIMESTAMPDIFF(
          SECOND,
          MIN(h.reading_header_time),
          MAX(h.reading_header_time)
        ) AS observed_span_seconds
      FROM tblreading_headers h
      WHERE h.reading_header_room_id = ?
        ${config.whereSql}
    `,
    [roomId],
  );
  const [gapRows] = await pool.query<ReadingGapRow[]>(
    `
      SELECT
        AVG(intervals.gap_seconds) AS average_interval_seconds,
        MAX(intervals.gap_seconds) AS longest_gap_seconds,
        COALESCE(SUM(intervals.gap_seconds > ?), 0) AS gap_count
      FROM (
        SELECT TIMESTAMPDIFF(
          SECOND,
          LAG(h.reading_header_time) OVER (
            ORDER BY h.reading_header_time, h.reading_header_id
          ),
          h.reading_header_time
        ) AS gap_seconds
        FROM tblreading_headers h
        WHERE h.reading_header_room_id = ?
          ${config.whereSql}
      ) intervals
      WHERE intervals.gap_seconds IS NOT NULL
    `,
    [expectedIntervalSeconds * 2, roomId],
  );

  const quality = qualityRows[0];
  const gaps = gapRows[0];
  const sampleCount = quality?.sample_count ?? 0;
  const expectedSampleCount = Math.floor(config.windowSeconds / expectedIntervalSeconds) + 1;

  return {
    evaluatedWindowSeconds: config.windowSeconds,
    expectedIntervalSeconds,
    sampleCount,
    expectedSampleCount,
    estimatedMissingSamples: Math.max(0, expectedSampleCount - sampleCount),
    coveragePercentage: round(Math.min(100, (sampleCount / expectedSampleCount) * 100), 1),
    firstReadingAt: quality?.first_reading_at ?? null,
    lastReadingAt: quality?.last_reading_at ?? null,
    observedSpanSeconds: quality?.observed_span_seconds ?? null,
    averageIntervalSeconds: round(gaps?.average_interval_seconds, 1),
    longestGapSeconds: round(gaps?.longest_gap_seconds, 1),
    gapCount: Number(gaps?.gap_count ?? 0),
  };
}

function buildHardwareHealth(input: {
  room: Awaited<ReturnType<typeof getMonitoringRoom>>;
  latest: ReturnType<typeof mapSample> | null;
  heartbeat: DeviceHeartbeatRow | null;
  samplingQuality: Awaited<ReturnType<typeof getReadingQuality>>;
}) {
  const { room, latest, heartbeat, samplingQuality } = input;
  const lastReadingAgeSeconds = getDurationSecondsSince(latest?.timestamp);
  const lastSeenAgeSeconds = getDurationSecondsSince(room.deviceLastSeen);
  const delayedAfterSeconds = env.EXPECTED_READING_INTERVAL_SECONDS * 3;
  let status: 'healthy' | 'delayed' | 'pzem_error' | 'upload_error' | 'offline' | 'unassigned';
  let message: string;

  if (room.deviceId === null) {
    status = 'unassigned';
    message = 'No monitoring device is assigned to this room.';
  } else if (room.deviceStatus === 'offline') {
    status = 'offline';
    message = 'No reading or heartbeat has reached the server within the offline threshold.';
  } else if (heartbeat && !Boolean(heartbeat.heartbeat_pzem_ok)) {
    status = 'pzem_error';
    message = 'The ESP32 is reachable, but its latest PZEM measurement attempt failed.';
  } else if (
    heartbeat
    && heartbeat.heartbeat_last_reading_http_status !== null
    && heartbeat.heartbeat_last_reading_http_status !== 0
    && heartbeat.heartbeat_last_reading_http_status !== 201
  ) {
    status = 'upload_error';
    message = `The ESP32 reported reading upload status ${heartbeat.heartbeat_last_reading_http_status}.`;
  } else if (lastReadingAgeSeconds === null || lastReadingAgeSeconds > delayedAfterSeconds) {
    status = 'delayed';
    message = 'The ESP32 is reachable, but measurement delivery is later than expected.';
  } else {
    status = 'healthy';
    message = 'Device connectivity and measurement delivery are within the expected interval.';
  }

  return {
    status,
    message,
    heartbeatSupported: heartbeat !== null,
    offlineAfterSeconds: env.MONITORING_OFFLINE_SECONDS,
    delayedAfterSeconds,
    lastSeenAt: room.deviceLastSeen,
    lastSeenAgeSeconds,
    lastReadingAt: latest?.timestamp ?? null,
    lastReadingAgeSeconds,
    heartbeat: heartbeat ? {
      receivedAt: heartbeat.heartbeat_received_at,
      deviceTime: heartbeat.heartbeat_device_time,
      uptimeSeconds: heartbeat.heartbeat_uptime_seconds,
      wifiRssiDbm: heartbeat.heartbeat_wifi_rssi_dbm,
      pzemOk: Boolean(heartbeat.heartbeat_pzem_ok),
      lastReadingHttpStatus: heartbeat.heartbeat_last_reading_http_status,
      firmwareVersion: heartbeat.heartbeat_firmware_version,
      errorCode: heartbeat.heartbeat_error_code,
    } : null,
    samplingQuality,
  };
}

async function getEnergyBoundaries(roomId: number, whereSql: string) {
  const baseSql = `
    SELECT
      h.reading_header_time,
      d.reading_detail_energy_kwh
    FROM tblreading_headers h
    INNER JOIN tblreading_details d
      ON d.reading_detail_header_id = h.reading_header_id
    WHERE h.reading_header_room_id = ?
      ${whereSql}
  `;

  const [firstRows] = await pool.query<EnergyBoundaryRow[]>(
    `${baseSql} ORDER BY h.reading_header_time ASC, h.reading_header_id ASC LIMIT 1`,
    [roomId],
  );
  const [lastRows] = await pool.query<EnergyBoundaryRow[]>(
    `${baseSql} ORDER BY h.reading_header_time DESC, h.reading_header_id DESC LIMIT 1`,
    [roomId],
  );

  return { first: firstRows[0] ?? null, last: lastRows[0] ?? null };
}

function calculateEnergyDelta(boundaries: Awaited<ReturnType<typeof getEnergyBoundaries>>) {
  if (!boundaries.first || !boundaries.last) {
    return { energyKwh: null, counterResetDetected: false };
  }

  const delta = boundaries.last.reading_detail_energy_kwh
    - boundaries.first.reading_detail_energy_kwh;

  if (delta < 0) {
    return { energyKwh: null, counterResetDetected: true };
  }

  return { energyKwh: round(delta, 4), counterResetDetected: false };
}

async function getMonthlyProjection(roomId: number, ratePerKwh: number) {
  const boundaries = await getEnergyBoundaries(
    roomId,
    "AND h.reading_header_time >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')",
  );
  const delta = calculateEnergyDelta(boundaries);

  if (!boundaries.first || !boundaries.last || delta.energyKwh === null) {
    return {
      status: delta.counterResetDetected ? 'counter_reset' : 'unavailable',
      measuredEnergyKwh: delta.energyKwh,
      measuredCost: delta.energyKwh === null ? null : round(delta.energyKwh * ratePerKwh),
      observedHours: null,
      projectedMonthlyEnergyKwh: null,
      projectedMonthlyCost: null,
      minimumObservationHours: 24,
    };
  }

  const firstAt = new Date(boundaries.first.reading_header_time.replace(' ', 'T'));
  const lastAt = new Date(boundaries.last.reading_header_time.replace(' ', 'T'));
  const observedHours = Math.max(0, (lastAt.getTime() - firstAt.getTime()) / 3_600_000);
  const measuredCost = round(delta.energyKwh * ratePerKwh);

  if (observedHours < 24) {
    return {
      status: 'insufficient_data',
      measuredEnergyKwh: delta.energyKwh,
      measuredCost,
      observedHours: round(observedHours),
      projectedMonthlyEnergyKwh: null,
      projectedMonthlyCost: null,
      minimumObservationHours: 24,
    };
  }

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedEnergy = (delta.energyKwh / (observedHours / 24)) * daysInMonth;

  return {
    status: observedHours < 24 * 7 ? 'provisional' : 'available',
    measuredEnergyKwh: delta.energyKwh,
    measuredCost,
    observedHours: round(observedHours),
    projectedMonthlyEnergyKwh: round(projectedEnergy, 3),
    projectedMonthlyCost: round(projectedEnergy * ratePerKwh),
    minimumObservationHours: 24,
  };
}

export async function getMonitoringDashboard(
  user: AuthenticatedUser,
  roomId: number,
  range: MonitoringRange,
) {
  const room = await getMonitoringRoom(user, roomId);
  const [latest, history, statistics, boundaries, projection, heartbeat, samplingQuality] = await Promise.all([
    getLatestSample(roomId),
    getHistory(roomId, range),
    getStatistics(roomId, range),
    getEnergyBoundaries(roomId, RANGE_CONFIG[range].whereSql),
    getMonthlyProjection(roomId, room.ratePerKwh),
    getLatestHeartbeat(room.deviceId),
    getReadingQuality(roomId, range),
  ]);
  const energy = calculateEnergyDelta(boundaries);
  const hardwareHealth = buildHardwareHealth({ room, latest, heartbeat, samplingQuality });

  return {
    generatedAt: new Date().toISOString(),
    range,
    room,
    latest,
    summary: {
      sampleCount: statistics?.sample_count ?? 0,
      firstReadingAt: statistics?.first_reading_at ?? null,
      lastReadingAt: statistics?.last_reading_at ?? null,
      averageVoltage: round(statistics?.average_voltage),
      minimumVoltage: round(statistics?.minimum_voltage),
      maximumVoltage: round(statistics?.maximum_voltage),
      averageCurrent: round(statistics?.average_current, 3),
      maximumCurrent: round(statistics?.maximum_current, 3),
      averagePowerW: round(statistics?.average_power_w),
      peakPowerW: round(statistics?.peak_power_w),
      averagePowerFactor: round(statistics?.average_power_factor),
      averageFrequency: round(statistics?.average_frequency),
      measuredEnergyKwh: energy.energyKwh,
      measuredCost: energy.energyKwh === null
        ? null
        : round(energy.energyKwh * room.ratePerKwh),
      counterResetDetected: energy.counterResetDetected,
    },
    monthlyProjection: projection,
    hardwareHealth,
    history,
  };
}

export async function getMonitoringReport(
  user: AuthenticatedUser,
  roomId: number,
  range: '24h' | '7d' | '30d',
) {
  const dashboard = await getMonitoringDashboard(user, roomId, range);

  return {
    reportTitle: `${dashboard.room.roomName} energy monitoring report`,
    ...dashboard,
  };
}

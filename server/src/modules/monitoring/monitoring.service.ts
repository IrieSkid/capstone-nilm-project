import { RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { env } from '../../config/env';
import { AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { assertRoomAccess } from '../../shared/utils/room-access';
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
            AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
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
    [env.DEVICE_OFFLINE_MINUTES, ...access.values],
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
            AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
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
    [env.DEVICE_OFFLINE_MINUTES, roomId],
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
  const [latest, history, statistics, boundaries, projection] = await Promise.all([
    getLatestSample(roomId),
    getHistory(roomId, range),
    getStatistics(roomId, range),
    getEnergyBoundaries(roomId, RANGE_CONFIG[range].whereSql),
    getMonthlyProjection(roomId, room.ratePerKwh),
  ]);
  const energy = calculateEnergyDelta(boundaries);

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

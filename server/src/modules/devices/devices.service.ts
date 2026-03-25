import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { env } from '../../config/env';
import { pool } from '../../config/db';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { getDurationSecondsSince, parseStoredDateTime } from '../../shared/utils/date';

interface DeviceRow extends RowDataPacket {
  device_id: number;
  device_name: string;
  device_identifier: string;
  device_status: 'online' | 'offline';
  device_last_seen: string | null;
  created_at: string;
  room_id: number | null;
  room_name: string | null;
  computed_status: 'online' | 'offline';
}

interface DeviceUptimeRow extends RowDataPacket {
  reading_header_device_id: number;
  reading_header_time: string;
}

interface DeviceUptimeContext {
  deviceId: number;
  computedStatus: 'online' | 'offline';
  deviceLastSeen: string | null;
}

function computeContinuousUptimeSeconds(readingTimes: string[], lastSeen: string | null) {
  const now = new Date();
  const lastSeenDate = parseStoredDateTime(lastSeen);

  if (!lastSeenDate) {
    return null;
  }

  const offlineThresholdMs = env.DEVICE_OFFLINE_MINUTES * 60 * 1000;

  if ((now.getTime() - lastSeenDate.getTime()) > offlineThresholdMs) {
    return null;
  }

  if (readingTimes.length === 0) {
    return getDurationSecondsSince(lastSeen, now);
  }

  let streakStart = parseStoredDateTime(readingTimes[0]) ?? lastSeenDate;
  let previousTimestamp = streakStart;

  for (let index = 1; index < readingTimes.length; index += 1) {
    const currentTimestamp = parseStoredDateTime(readingTimes[index]);

    if (!currentTimestamp) {
      continue;
    }

    if ((previousTimestamp.getTime() - currentTimestamp.getTime()) > offlineThresholdMs) {
      break;
    }

    streakStart = currentTimestamp;
    previousTimestamp = currentTimestamp;
  }

  return Math.max(0, Math.floor((now.getTime() - streakStart.getTime()) / 1000));
}

export async function getDeviceUptimeSecondsMap(deviceContexts: DeviceUptimeContext[]) {
  const uptimeByDeviceId = new Map<number, number | null>();

  for (const context of deviceContexts) {
    uptimeByDeviceId.set(context.deviceId, null);
  }

  const onlineContexts = deviceContexts.filter(
    (context) => context.computedStatus === 'online' && context.deviceLastSeen,
  );

  if (onlineContexts.length === 0) {
    return uptimeByDeviceId;
  }

  const deviceIds = onlineContexts.map((context) => context.deviceId);
  const placeholders = deviceIds.map(() => '?').join(', ');

  const [rows] = await pool.query<DeviceUptimeRow[]>(
    `
      SELECT
        reading_header_device_id,
        reading_header_time
      FROM tblreading_headers
      WHERE reading_header_device_id IN (${placeholders})
      ORDER BY reading_header_device_id ASC, reading_header_id DESC
    `,
    deviceIds,
  );

  const readingsByDeviceId = new Map<number, string[]>();

  for (const row of rows) {
    const readingTimes = readingsByDeviceId.get(row.reading_header_device_id) ?? [];
    readingTimes.push(row.reading_header_time);
    readingsByDeviceId.set(row.reading_header_device_id, readingTimes);
  }

  for (const context of onlineContexts) {
    const uptimeSeconds = computeContinuousUptimeSeconds(
      readingsByDeviceId.get(context.deviceId) ?? [],
      context.deviceLastSeen,
    );

    uptimeByDeviceId.set(context.deviceId, uptimeSeconds);
  }

  return uptimeByDeviceId;
}

function mapDeviceRow(row: DeviceRow) {
  return {
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceIdentifier: row.device_identifier,
    deviceStatus: row.device_status,
    computedStatus: row.computed_status,
    deviceLastSeen: row.device_last_seen,
    createdAt: row.created_at,
    roomId: row.room_id,
    roomName: row.room_name,
    deviceUptimeSeconds: null,
  };
}

export async function listDevices() {
  const [rows] = await pool.query<DeviceRow[]>(
    `
      SELECT
        d.device_id,
        d.device_name,
        d.device_identifier,
        d.device_status,
        d.device_last_seen,
        d.created_at,
        room.room_id,
        room.room_name,
        CASE
          WHEN d.device_status = 'online'
            AND d.device_last_seen IS NOT NULL
            AND d.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
          THEN 'online'
          ELSE 'offline'
        END AS computed_status
      FROM tbldevices d
      LEFT JOIN tblrooms room ON room.room_device_id = d.device_id
      ORDER BY d.device_id
    `,
    [env.DEVICE_OFFLINE_MINUTES],
  );

  const uptimeByDeviceId = await getDeviceUptimeSecondsMap(
    rows.map((row) => ({
      deviceId: row.device_id,
      computedStatus: row.computed_status,
      deviceLastSeen: row.device_last_seen,
    })),
  );

  return rows.map((row) => ({
    ...mapDeviceRow(row),
    deviceUptimeSeconds: uptimeByDeviceId.get(row.device_id) ?? null,
  }));
}

async function getDeviceById(deviceId: number) {
  const [rows] = await pool.query<DeviceRow[]>(
    `
      SELECT
        d.device_id,
        d.device_name,
        d.device_identifier,
        d.device_status,
        d.device_last_seen,
        d.created_at,
        room.room_id,
        room.room_name,
        CASE
          WHEN d.device_status = 'online'
            AND d.device_last_seen IS NOT NULL
            AND d.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
          THEN 'online'
          ELSE 'offline'
        END AS computed_status
      FROM tbldevices d
      LEFT JOIN tblrooms room ON room.room_device_id = d.device_id
      WHERE d.device_id = ?
      LIMIT 1
    `,
    [env.DEVICE_OFFLINE_MINUTES, deviceId],
  );

  if (!rows[0]) {
    throw new AppError(404, 'Device not found.');
  }

  const uptimeByDeviceId = await getDeviceUptimeSecondsMap([
    {
      deviceId: rows[0].device_id,
      computedStatus: rows[0].computed_status,
      deviceLastSeen: rows[0].device_last_seen,
    },
  ]);

  return {
    ...mapDeviceRow(rows[0]),
    deviceUptimeSeconds: uptimeByDeviceId.get(rows[0].device_id) ?? null,
  };
}

export async function createDevice(input: {
  device_name: string;
  device_identifier: string;
  device_status: 'online' | 'offline';
}) {
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO tbldevices (
          device_name,
          device_identifier,
          device_status,
          device_last_seen
        )
        VALUES (?, ?, ?, ?)
      `,
      [
        input.device_name,
        input.device_identifier,
        input.device_status,
        input.device_status === 'online' ? new Date() : null,
      ],
    );

    return getDeviceById(result.insertId);
  } catch (error) {
    handleDatabaseError(error, 'Device identifier already exists.');
  }
}

export async function updateDevice(
  deviceId: number,
  input: Partial<{
    device_name: string;
    device_identifier: string;
    device_status: 'online' | 'offline';
  }>,
) {
  await getDeviceById(deviceId);

  const fields: string[] = [];
  const values: Array<string | Date | null> = [];

  if (input.device_name !== undefined) {
    fields.push('device_name = ?');
    values.push(input.device_name);
  }

  if (input.device_identifier !== undefined) {
    fields.push('device_identifier = ?');
    values.push(input.device_identifier);
  }

  if (input.device_status !== undefined) {
    fields.push('device_status = ?');
    values.push(input.device_status);
    fields.push('device_last_seen = ?');
    values.push(input.device_status === 'online' ? new Date() : null);
  }

  try {
    await pool.query(
      `
        UPDATE tbldevices
        SET ${fields.join(', ')}
        WHERE device_id = ?
      `,
      [...values, deviceId],
    );
  } catch (error) {
    handleDatabaseError(error, 'Device identifier already exists.');
  }

  return getDeviceById(deviceId);
}

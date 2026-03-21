import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { env } from '../../config/env';
import { pool } from '../../config/db';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';

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

  return rows.map(mapDeviceRow);
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

  return mapDeviceRow(rows[0]);
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

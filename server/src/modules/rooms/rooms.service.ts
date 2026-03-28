import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { assertRoomHasNoOpenBillingCycle } from '../billing/billing.service';

interface RoomRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
  landlord_id: number | null;
  landlord_name: string | null;
  landlord_email: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  device_id: number | null;
  device_name: string | null;
  device_identifier: string | null;
}

interface ExistsRow extends RowDataPacket {
  id: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface DeviceOwnerRow extends RowDataPacket {
  device_id: number;
  device_owner_landlord_id: number | null;
}

function mapRoomRow(row: RoomRow) {
  return {
    roomId: row.room_id,
    roomName: row.room_name,
    roomRatePerKwh: row.room_rate_per_kwh,
    roomStatus: row.room_status,
    landlordId: row.landlord_id,
    landlordName: row.landlord_name,
    landlordEmail: row.landlord_email,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    deviceId: row.device_id,
    deviceName: row.device_name,
    deviceIdentifier: row.device_identifier,
  };
}

async function assertTenantExists(tenantId: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT u.user_id AS id
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      WHERE u.user_id = ? AND r.role_name = 'tenant'
      LIMIT 1
    `,
    [tenantId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Room must reference a valid tenant.');
  }
}

async function assertTenantOwnedByLandlord(tenantId: number, landlordId: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT u.user_id AS id
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      WHERE u.user_id = ?
        AND r.role_name = 'tenant'
        AND u.user_landlord_id = ?
      LIMIT 1
    `,
    [tenantId, landlordId],
  );

  if (!rows[0]) {
    throw new AppError(409, 'Selected tenant belongs to a different landlord owner.');
  }
}

async function assertLandlordExists(landlordId: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT u.user_id AS id
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      WHERE u.user_id = ? AND r.role_name = 'landlord'
      LIMIT 1
    `,
    [landlordId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Room must reference a valid landlord.');
  }
}

async function assertDeviceExists(deviceId: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT device_id AS id
      FROM tbldevices
      WHERE device_id = ?
      LIMIT 1
    `,
    [deviceId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Room must reference a valid device.');
  }
}

async function getDeviceOwnerLandlordId(deviceId: number) {
  const [rows] = await pool.query<DeviceOwnerRow[]>(
    `
      SELECT
        device_id,
        device_owner_landlord_id
      FROM tbldevices
      WHERE device_id = ?
      LIMIT 1
    `,
    [deviceId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Room must reference a valid device.');
  }

  return rows[0].device_owner_landlord_id;
}

async function assertDeviceOwnershipMatchesRoomLandlord(deviceId: number, landlordId: number | null) {
  const deviceOwnerLandlordId = await getDeviceOwnerLandlordId(deviceId);

  if (landlordId === null && deviceOwnerLandlordId !== null) {
    throw new AppError(
      409,
      'Assign the room to the same landlord before using a landlord-owned device.',
    );
  }

  if (landlordId !== null && deviceOwnerLandlordId !== landlordId) {
    throw new AppError(
      409,
      'Selected device belongs to a different landlord owner.',
    );
  }
}

async function assertDeviceIsAvailable(deviceId: number, currentRoomId?: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT room_id AS id
      FROM tblrooms
      WHERE room_device_id = ?
        AND (? IS NULL OR room_id <> ?)
      LIMIT 1
    `,
    [deviceId, currentRoomId ?? null, currentRoomId ?? null],
  );

  if (rows[0]) {
    throw new AppError(409, 'Selected device is already assigned to another room.');
  }
}

async function assertTenantIsAvailable(tenantId: number, currentRoomId?: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT room_id AS id
      FROM tblrooms
      WHERE room_tenant_id = ?
        AND (? IS NULL OR room_id <> ?)
      LIMIT 1
    `,
    [tenantId, currentRoomId ?? null, currentRoomId ?? null],
  );

  if (rows[0]) {
    throw new AppError(409, 'Selected tenant is already assigned to another room.');
  }
}

export async function listRooms() {
  const [rows] = await pool.query<RoomRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        landlord.user_id AS landlord_id,
        landlord.user_name AS landlord_name,
        landlord.user_email AS landlord_email,
        tenant.user_id AS tenant_id,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_id AS device_id,
        device.device_name AS device_name,
        device.device_identifier AS device_identifier
      FROM tblrooms room
      LEFT JOIN tblusers landlord ON landlord.user_id = room.room_landlord_id
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = room.room_device_id
      ORDER BY room.room_id
    `,
  );

  return rows.map(mapRoomRow);
}

async function getRoomById(roomId: number) {
  const [rows] = await pool.query<RoomRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        landlord.user_id AS landlord_id,
        landlord.user_name AS landlord_name,
        landlord.user_email AS landlord_email,
        tenant.user_id AS tenant_id,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        device.device_id AS device_id,
        device.device_name AS device_name,
        device.device_identifier AS device_identifier
      FROM tblrooms room
      LEFT JOIN tblusers landlord ON landlord.user_id = room.room_landlord_id
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = room.room_device_id
      WHERE room.room_id = ?
      LIMIT 1
    `,
    [roomId],
  );

  if (!rows[0]) {
    throw new AppError(404, 'Room not found.');
  }

  return mapRoomRow(rows[0]);
}

async function assertRoomCanBeDeleted(roomId: number) {
  const room = await getRoomById(roomId);

  if (room.roomStatus !== 'available') {
    throw new AppError(409, 'Only available rooms can be deleted.');
  }

  if (room.landlordId !== null || room.tenantId !== null || room.deviceId !== null) {
    throw new AppError(409, 'Only fully unassigned rooms can be deleted.');
  }

  const [readingRows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM tblreading_headers
      WHERE reading_header_room_id = ?
    `,
    [roomId],
  );

  if ((readingRows[0]?.total ?? 0) > 0) {
    throw new AppError(409, 'Rooms with recorded readings cannot be deleted.');
  }

  const [detectionRows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM tblappliance_detection_headers
      WHERE detection_header_room_id = ?
    `,
    [roomId],
  );

  if ((detectionRows[0]?.total ?? 0) > 0) {
    throw new AppError(409, 'Rooms with recorded detections cannot be deleted.');
  }

  return room;
}

export async function createRoom(input: {
  room_name: string;
  room_landlord_id: number | null;
  room_tenant_id: number | null;
  room_device_id: number | null;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
}) {
  if (input.room_landlord_id !== null) {
    await assertLandlordExists(input.room_landlord_id);
  }

  if (input.room_tenant_id !== null) {
    await assertTenantExists(input.room_tenant_id);
    await assertTenantIsAvailable(input.room_tenant_id);

    if (input.room_landlord_id !== null) {
      await assertTenantOwnedByLandlord(input.room_tenant_id, input.room_landlord_id);
    }
  }

  if (input.room_device_id !== null) {
    await assertDeviceExists(input.room_device_id);
    await assertDeviceIsAvailable(input.room_device_id);
    await assertDeviceOwnershipMatchesRoomLandlord(
      input.room_device_id,
      input.room_landlord_id,
    );
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO tblrooms (
          room_name,
          room_landlord_id,
          room_tenant_id,
          room_device_id,
          room_rate_per_kwh,
          room_status
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        input.room_name,
        input.room_landlord_id,
        input.room_tenant_id,
        input.room_device_id,
        input.room_rate_per_kwh,
        input.room_status,
      ],
    );

    return getRoomById(result.insertId);
  } catch (error) {
    handleDatabaseError(error, 'Room name or device assignment already exists.');
  }
}

export async function updateRoom(
  roomId: number,
  input: Partial<{
    room_name: string;
    room_landlord_id: number | null;
    room_tenant_id: number | null;
    room_device_id: number | null;
    room_rate_per_kwh: number;
    room_status: 'available' | 'occupied';
  }>,
) {
  const currentRoom = await getRoomById(roomId);

  if (
    input.room_landlord_id !== undefined
    || input.room_tenant_id !== undefined
    || input.room_device_id !== undefined
    || input.room_status !== undefined
  ) {
    await assertRoomHasNoOpenBillingCycle(roomId);
  }

  const effectiveLandlordId =
    input.room_landlord_id !== undefined ? input.room_landlord_id : currentRoom.landlordId;
  const effectiveTenantId =
    input.room_tenant_id !== undefined ? input.room_tenant_id : currentRoom.tenantId;

  if (input.room_landlord_id !== undefined && input.room_landlord_id !== null) {
    await assertLandlordExists(input.room_landlord_id);
  }

  if (input.room_tenant_id !== undefined && input.room_tenant_id !== null) {
    await assertTenantExists(input.room_tenant_id);
    await assertTenantIsAvailable(input.room_tenant_id, roomId);
  }

  if (effectiveLandlordId !== null && effectiveTenantId !== null) {
    await assertTenantOwnedByLandlord(effectiveTenantId, effectiveLandlordId);
  }

  if (input.room_device_id !== undefined && input.room_device_id !== null) {
    await assertDeviceExists(input.room_device_id);
    await assertDeviceIsAvailable(input.room_device_id, roomId);
  }

  if (effectiveLandlordId !== null && input.room_device_id !== undefined && input.room_device_id !== null) {
    await assertDeviceOwnershipMatchesRoomLandlord(input.room_device_id, effectiveLandlordId);
  }

  if (effectiveLandlordId === null && input.room_device_id !== undefined && input.room_device_id !== null) {
    await assertDeviceOwnershipMatchesRoomLandlord(input.room_device_id, null);
  }

  if (input.room_landlord_id !== undefined && currentRoom.deviceId !== null && input.room_device_id === undefined) {
    await assertDeviceOwnershipMatchesRoomLandlord(currentRoom.deviceId, effectiveLandlordId);
  }

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.room_name !== undefined) {
    fields.push('room_name = ?');
    values.push(input.room_name);
  }

  if (input.room_landlord_id !== undefined) {
    fields.push('room_landlord_id = ?');
    values.push(input.room_landlord_id);
  }

  if (input.room_tenant_id !== undefined) {
    fields.push('room_tenant_id = ?');
    values.push(input.room_tenant_id);
  }

  if (input.room_device_id !== undefined) {
    fields.push('room_device_id = ?');
    values.push(input.room_device_id);
  }

  if (input.room_rate_per_kwh !== undefined) {
    fields.push('room_rate_per_kwh = ?');
    values.push(input.room_rate_per_kwh);
  }

  if (input.room_status !== undefined) {
    fields.push('room_status = ?');
    values.push(input.room_status);
  }

  try {
    await pool.query(
      `
        UPDATE tblrooms
        SET ${fields.join(', ')}
        WHERE room_id = ?
      `,
      [...values, roomId],
    );
  } catch (error) {
    handleDatabaseError(error, 'Room name or device assignment already exists.');
  }

  return getRoomById(roomId);
}

export async function deleteRoom(roomId: number) {
  const room = await assertRoomCanBeDeleted(roomId);

  await pool.query(
    `
      DELETE FROM tblrooms
      WHERE room_id = ?
    `,
    [roomId],
  );

  return room;
}

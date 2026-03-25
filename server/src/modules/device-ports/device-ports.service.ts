import { RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { getDurationSecondsSince } from '../../shared/utils/date';

interface DevicePortRow extends RowDataPacket {
  device_port_id: number;
  device_port_device_id: number;
  device_port_label: string;
  device_port_supply_state: 'on' | 'off';
  device_port_last_changed_at: string;
  device_port_last_changed_by_user_id: number | null;
  created_at: string;
  room_id: number;
  room_name: string;
  appliance_type_id: number;
  appliance_type_name: string;
  category_name: string;
  appliance_type_power_pattern: string;
  changed_by_name: string | null;
}

function mapDevicePort(row: DevicePortRow) {
  return {
    devicePortId: row.device_port_id,
    deviceId: row.device_port_device_id,
    roomId: row.room_id,
    roomName: row.room_name,
    portLabel: row.device_port_label,
    supplyState: row.device_port_supply_state,
    lastChangedAt: row.device_port_last_changed_at,
    lastChangedByUserId: row.device_port_last_changed_by_user_id,
    lastChangedByName: row.changed_by_name,
    createdAt: row.created_at,
    applianceTypeId: row.appliance_type_id,
    applianceTypeName: row.appliance_type_name,
    categoryName: row.category_name,
    powerPattern: row.appliance_type_power_pattern,
    applianceUptimeSeconds:
      row.device_port_supply_state === 'on'
        ? getDurationSecondsSince(row.device_port_last_changed_at)
        : null,
  };
}

async function findDevicePortRow(portId: number) {
  const [rows] = await pool.query<DevicePortRow[]>(
    `
      SELECT
        dp.device_port_id,
        dp.device_port_device_id,
        dp.device_port_label,
        dp.device_port_supply_state,
        dp.device_port_last_changed_at,
        dp.device_port_last_changed_by_user_id,
        dp.created_at,
        room.room_id,
        room.room_name,
        ap.appliance_type_id,
        ap.appliance_type_name,
        cat.category_name,
        ap.appliance_type_power_pattern,
        changed_by.user_name AS changed_by_name
      FROM tbldevice_ports dp
      INNER JOIN tbldevices device ON device.device_id = dp.device_port_device_id
      INNER JOIN tblrooms room ON room.room_device_id = device.device_id
      INNER JOIN tblappliance_types ap ON ap.appliance_type_id = dp.device_port_appliance_type_id
      INNER JOIN tblappliance_categories cat ON cat.category_id = ap.appliance_type_category_id
      LEFT JOIN tblusers changed_by ON changed_by.user_id = dp.device_port_last_changed_by_user_id
      WHERE dp.device_port_id = ?
      LIMIT 1
    `,
    [portId],
  );

  return rows[0] ?? null;
}

export async function getDevicePortsByRoomId(roomId: number) {
  const [rows] = await pool.query<DevicePortRow[]>(
    `
      SELECT
        dp.device_port_id,
        dp.device_port_device_id,
        dp.device_port_label,
        dp.device_port_supply_state,
        dp.device_port_last_changed_at,
        dp.device_port_last_changed_by_user_id,
        dp.created_at,
        room.room_id,
        room.room_name,
        ap.appliance_type_id,
        ap.appliance_type_name,
        cat.category_name,
        ap.appliance_type_power_pattern,
        changed_by.user_name AS changed_by_name
      FROM tbldevice_ports dp
      INNER JOIN tbldevices device ON device.device_id = dp.device_port_device_id
      INNER JOIN tblrooms room ON room.room_device_id = device.device_id
      INNER JOIN tblappliance_types ap ON ap.appliance_type_id = dp.device_port_appliance_type_id
      INNER JOIN tblappliance_categories cat ON cat.category_id = ap.appliance_type_category_id
      LEFT JOIN tblusers changed_by ON changed_by.user_id = dp.device_port_last_changed_by_user_id
      WHERE room.room_id = ?
      ORDER BY dp.device_port_label
    `,
    [roomId],
  );

  return rows.map(mapDevicePort);
}

export async function updateDevicePortSupplyState(input: {
  portId: number;
  supplyState: 'on' | 'off';
  user: AuthenticatedUser;
}) {
  const existingPort = await findDevicePortRow(input.portId);

  if (!existingPort) {
    throw new AppError(404, 'Device port not found.');
  }

  if (
    input.user.roleName === 'tenant'
    && existingPort.room_id
    && !(await tenantOwnsRoom(input.user.userId, existingPort.room_id))
  ) {
    throw new AppError(403, 'You are not allowed to control this port.');
  }

  if (!['admin', 'tenant'].includes(input.user.roleName)) {
    throw new AppError(403, 'You are not allowed to control this port.');
  }

  await pool.query(
    `
      UPDATE tbldevice_ports
      SET
        device_port_supply_state = ?,
        device_port_last_changed_at = NOW(),
        device_port_last_changed_by_user_id = ?
      WHERE device_port_id = ?
    `,
    [input.supplyState, input.user.userId, input.portId],
  );

  const updatedPort = await findDevicePortRow(input.portId);

  if (!updatedPort) {
    throw new AppError(404, 'Device port not found after update.');
  }

  return mapDevicePort(updatedPort);
}

async function tenantOwnsRoom(userId: number, roomId: number) {
  const [rows] = await pool.query<Array<RowDataPacket & { room_id: number }>>(
    `
      SELECT room_id
      FROM tblrooms
      WHERE room_id = ? AND room_tenant_id = ?
      LIMIT 1
    `,
    [roomId, userId],
  );

  return Boolean(rows[0]);
}

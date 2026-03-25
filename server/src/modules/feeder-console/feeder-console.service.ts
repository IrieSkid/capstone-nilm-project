import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { AppError } from '../../shared/utils/app-error';
import { getDurationSecondsSince } from '../../shared/utils/date';

interface ApplianceTypeRow extends RowDataPacket {
  appliance_type_id: number;
  appliance_type_name: string;
  appliance_type_typical_power_w: number;
  appliance_type_power_factor: number;
  appliance_type_nominal_frequency_hz: number;
  appliance_type_thd_reference: number;
  appliance_type_power_pattern: string;
  category_name: string;
}

interface RoomDeviceRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
  tenant_name: string | null;
  device_id: number;
  device_name: string;
  device_identifier: string;
}

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

interface ExistsRow extends RowDataPacket {
  id: number;
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

async function assertAssignedDeviceExists(deviceId: number) {
  const [rows] = await pool.query<RoomDeviceRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        tenant.user_name AS tenant_name,
        device.device_id,
        device.device_name,
        device.device_identifier
      FROM tblrooms room
      INNER JOIN tbldevices device ON device.device_id = room.room_device_id
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      WHERE device.device_id = ?
      LIMIT 1
    `,
    [deviceId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Select a device that is already assigned to a room.');
  }

  return rows[0];
}

async function assertApplianceTypeExists(applianceTypeId: number) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT appliance_type_id AS id
      FROM tblappliance_types
      WHERE appliance_type_id = ?
      LIMIT 1
    `,
    [applianceTypeId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Select a valid appliance type.');
  }
}

async function getNextPortLabel(deviceId: number) {
  const [rows] = await pool.query<Array<RowDataPacket & { device_port_label: string }>>(
    `
      SELECT device_port_label
      FROM tbldevice_ports
      WHERE device_port_device_id = ?
    `,
    [deviceId],
  );

  const maxPortNumber = rows.reduce((currentMax, row) => {
    const parsedNumber = Number(row.device_port_label.replace(/\D/g, ''));
    return Number.isFinite(parsedNumber) ? Math.max(currentMax, parsedNumber) : currentMax;
  }, 0);

  return `Port ${maxPortNumber + 1}`;
}

export async function listFeederConsoleApplianceTypes() {
  const [rows] = await pool.query<ApplianceTypeRow[]>(
    `
      SELECT
        ap.appliance_type_id,
        ap.appliance_type_name,
        ap.appliance_type_typical_power_w,
        ap.appliance_type_power_factor,
        ap.appliance_type_nominal_frequency_hz,
        ap.appliance_type_thd_reference,
        ap.appliance_type_power_pattern,
        cat.category_name
      FROM tblappliance_types ap
      INNER JOIN tblappliance_categories cat ON cat.category_id = ap.appliance_type_category_id
      ORDER BY cat.category_name, ap.appliance_type_name
    `,
  );

  return rows.map((row) => ({
    applianceTypeId: row.appliance_type_id,
    applianceTypeName: row.appliance_type_name,
    categoryName: row.category_name,
    typicalPowerW: row.appliance_type_typical_power_w,
    powerFactor: row.appliance_type_power_factor,
    nominalFrequencyHz: row.appliance_type_nominal_frequency_hz,
    thdReference: row.appliance_type_thd_reference,
    powerPattern: row.appliance_type_power_pattern,
  }));
}

export async function listFeederConsoleRooms() {
  const [rooms] = await pool.query<RoomDeviceRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        tenant.user_name AS tenant_name,
        device.device_id,
        device.device_name,
        device.device_identifier
      FROM tblrooms room
      INNER JOIN tbldevices device ON device.device_id = room.room_device_id
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      ORDER BY room.room_name
    `,
  );

  return Promise.all(
    rooms.map(async (room) => {
      const [ports] = await pool.query<DevicePortRow[]>(
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
        [room.room_id],
      );

      return {
        roomId: room.room_id,
        roomName: room.room_name,
        roomRatePerKwh: room.room_rate_per_kwh,
        roomStatus: room.room_status,
        tenantName: room.tenant_name ?? 'Unassigned tenant',
        deviceId: room.device_id,
        deviceName: room.device_name,
        deviceIdentifier: room.device_identifier,
        ports: ports.map(mapDevicePort),
      };
    }),
  );
}

export async function createFeederConsolePort(input: {
  deviceId: number;
  applianceTypeId: number;
  portLabel?: string;
  supplyState: 'on' | 'off';
}) {
  await assertAssignedDeviceExists(input.deviceId);
  await assertApplianceTypeExists(input.applianceTypeId);

  const normalizedLabel = input.portLabel?.trim() || await getNextPortLabel(input.deviceId);

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO tbldevice_ports (
          device_port_device_id,
          device_port_label,
          device_port_appliance_type_id,
          device_port_supply_state,
          device_port_last_changed_at,
          device_port_last_changed_by_user_id
        )
        VALUES (?, ?, ?, ?, NOW(), NULL)
      `,
      [input.deviceId, normalizedLabel, input.applianceTypeId, input.supplyState],
    );

    const createdPort = await findDevicePortRow(result.insertId);

    if (!createdPort) {
      throw new AppError(404, 'Device port not found after creation.');
    }

    return mapDevicePort(createdPort);
  } catch (error) {
    handleDatabaseError(error, 'Port label already exists for this device.');
  }
}

export async function updateFeederConsolePort(input: {
  portId: number;
  applianceTypeId?: number;
  portLabel?: string;
  supplyState?: 'on' | 'off';
}) {
  const existingPort = await findDevicePortRow(input.portId);

  if (!existingPort) {
    throw new AppError(404, 'Device port not found.');
  }

  if (input.applianceTypeId !== undefined) {
    await assertApplianceTypeExists(input.applianceTypeId);
  }

  const fields: string[] = [];
  const values: Array<number | string> = [];

  if (input.applianceTypeId !== undefined) {
    fields.push('device_port_appliance_type_id = ?');
    values.push(input.applianceTypeId);
  }

  if (input.portLabel !== undefined) {
    fields.push('device_port_label = ?');
    values.push(input.portLabel.trim());
  }

  if (input.supplyState !== undefined) {
    fields.push('device_port_supply_state = ?');
    values.push(input.supplyState);
  }

  if (fields.length === 0) {
    return mapDevicePort(existingPort);
  }

  fields.push('device_port_last_changed_at = NOW()');
  fields.push('device_port_last_changed_by_user_id = NULL');

  try {
    await pool.query(
      `
        UPDATE tbldevice_ports
        SET ${fields.join(', ')}
        WHERE device_port_id = ?
      `,
      [...values, input.portId],
    );
  } catch (error) {
    handleDatabaseError(error, 'Port label already exists for this device.');
  }

  const updatedPort = await findDevicePortRow(input.portId);

  if (!updatedPort) {
    throw new AppError(404, 'Device port not found after update.');
  }

  return mapDevicePort(updatedPort);
}

export async function deleteFeederConsolePort(portId: number) {
  const existingPort = await findDevicePortRow(portId);

  if (!existingPort) {
    throw new AppError(404, 'Device port not found.');
  }

  await pool.query(
    `
      DELETE FROM tbldevice_ports
      WHERE device_port_id = ?
    `,
    [portId],
  );

  return {
    devicePortId: existingPort.device_port_id,
    portLabel: existingPort.device_port_label,
    applianceTypeName: existingPort.appliance_type_name,
    roomId: existingPort.room_id,
    roomName: existingPort.room_name,
    deviceId: existingPort.device_port_device_id,
  };
}

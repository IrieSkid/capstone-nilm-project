import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { env } from '../../config/env';
import { pool } from '../../config/db';
import { AppModuleKey, AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { assertRoomAccess, getLandlordRoomIds } from '../../shared/utils/room-access';
import { assertRoomHasNoOpenBillingCycle } from '../billing/billing.service';
import { getLatestDetectionByRoomId } from '../detections/detections.service';
import { getDevicePortsByRoomId } from '../device-ports/device-ports.service';
import { getDeviceUptimeSecondsMap } from '../devices/devices.service';
import {
  getRoomAlertSettings,
  updateRoomAlertSettings,
} from '../notifications/notification-alerts.service';
import { getLatestReadingByRoomId } from '../readings/readings.service';

interface LandlordRoomRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  device_id: number | null;
  device_name: string | null;
  device_identifier: string | null;
  device_last_seen: string | null;
  computed_status: 'online' | 'offline';
}

interface ExistsRow extends RowDataPacket {
  id: number;
}

interface DeviceOwnerRow extends RowDataPacket {
  device_id: number;
  device_owner_landlord_id: number | null;
}

interface LandlordTenantOptionRow extends RowDataPacket {
  user_id: number;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  user_landlord_id: number | null;
  assigned_room_id: number | null;
  assigned_room_name: string | null;
}

interface LandlordDeviceOptionRow extends RowDataPacket {
  device_id: number;
  device_name: string;
  device_identifier: string;
  device_last_seen: string | null;
  computed_status: 'online' | 'offline';
  assigned_room_id: number | null;
  assigned_room_name: string | null;
}

interface LandlordOwnedDeviceRow extends RowDataPacket {
  device_id: number;
  device_name: string;
  device_identifier: string;
  device_status: 'online' | 'offline';
  device_last_seen: string | null;
  computed_status: 'online' | 'offline';
  room_id: number | null;
  room_name: string | null;
  tenant_name: string | null;
}

interface LandlordPendingTenantRequestRow extends RowDataPacket {
  tenant_id: number;
  tenant_name: string;
  tenant_email: string;
  tenant_phone: string | null;
  created_at: string;
  status_name: string;
  landlord_owner_id: number;
  landlord_owner_name: string;
}

interface CreateLandlordRoomInput {
  room_name: string;
  room_rate_per_kwh: number;
}

type DevicePorts = Awaited<ReturnType<typeof getDevicePortsByRoomId>>;

interface LandlordRoomSnapshotInternal {
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  roomStatus: 'available' | 'occupied';
  tenantId: number | null;
  tenantName: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceIdentifier: string | null;
  deviceLastSeen: string | null;
  computedStatus: 'online' | 'offline';
  deviceUptimeSeconds: number | null;
  latestReading: Awaited<ReturnType<typeof getLatestReadingByRoomId>>;
  latestDetection: Awaited<ReturnType<typeof getLatestDetectionByRoomId>>;
  devicePorts: DevicePorts;
  alertSettings: Awaited<ReturnType<typeof getRoomAlertSettings>>;
}

function hasPermission(user: AuthenticatedUser, moduleKey: AppModuleKey) {
  return user.roleName === 'admin' || user.permissions.includes(moduleKey);
}

function ensureLandlordRoomUpdatePermission(
  user: AuthenticatedUser,
  input: Partial<{
    room_tenant_id: number | null;
    room_device_id: number | null;
    room_rate_per_kwh: number;
    room_status: 'available' | 'occupied';
  }>,
) {
  if ((input.room_rate_per_kwh !== undefined || input.room_status !== undefined)
    && !hasPermission(user, 'landlord.rooms.update')) {
    throw new AppError(403, 'Room detail updates are currently disabled for your landlord account.');
  }

  if (input.room_tenant_id !== undefined && !hasPermission(user, 'landlord.tenants.assign')) {
    throw new AppError(403, 'Tenant assignment is currently disabled for your landlord account.');
  }

  if (input.room_device_id !== undefined && !hasPermission(user, 'landlord.devices.assign')) {
    throw new AppError(403, 'Device assignment is currently disabled for your landlord account.');
  }
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
    throw new AppError(409, 'You can only assign tenants owned by your landlord account.');
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

async function assertDeviceOwnedByLandlord(deviceId: number, landlordId: number) {
  const ownerLandlordId = await getDeviceOwnerLandlordId(deviceId);

  if (ownerLandlordId !== landlordId) {
    throw new AppError(409, 'You can only assign devices owned by your landlord account.');
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

async function assertLandlordRoomNameIsAvailable(roomName: string) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT room_id AS id
      FROM tblrooms
      WHERE room_name = ?
      LIMIT 1
    `,
    [roomName],
  );

  if (rows[0]) {
    throw new AppError(409, 'A room with that name already exists.');
  }
}

function getTypicalDailyUsageHours(applianceTypeName: string) {
  const normalizedName = applianceTypeName.trim().toLowerCase();

  if (normalizedName.includes('inverter air conditioner') || normalizedName.includes('air conditioner')) {
    return 8;
  }

  if (normalizedName.includes('electric fan')) {
    return 8;
  }

  if (normalizedName.includes('refrigerator')) {
    return 10;
  }

  if (normalizedName.includes('rice cooker')) {
    return 1.5;
  }

  if (normalizedName.includes('led tv')) {
    return 5;
  }

  return 8;
}

function getEstimatedMonthlyCost(input: {
  powerW: number | null | undefined;
  roomRatePerKwh: number;
  appliances?: Array<{
    applianceTypeName: string;
    detectedPower: number;
  }> | null;
}) {
  if (input.appliances && input.appliances.length > 0) {
    return Number(
      input.appliances
        .reduce(
          (sum, appliance) =>
            sum +
            (appliance.detectedPower / 1000) *
              getTypicalDailyUsageHours(appliance.applianceTypeName) *
              30 *
              input.roomRatePerKwh,
          0,
        )
        .toFixed(2),
    );
  }

  if (input.powerW === null || input.powerW === undefined) {
    return null;
  }

  return Number((((input.powerW / 1000) * 8 * 30) * input.roomRatePerKwh).toFixed(2));
}

function getRealtimeCostPerHour(powerW: number | null | undefined, roomRatePerKwh: number) {
  if (powerW === null || powerW === undefined) {
    return null;
  }

  return Number((((powerW / 1000) * roomRatePerKwh)).toFixed(2));
}

function enrichDetectedAppliancesWithPorts<
  T extends {
    applianceTypeId: number;
    applianceTypeName: string;
    categoryName: string;
    powerPattern: string;
    status: 'ON' | 'OFF';
    confidence: number;
    detectedPower: number;
    detectedFrequency: number;
    detectedThd: number;
    powerShare: number;
    detectionDetailId?: number;
    rank: number;
    scoreBreakdown?: unknown;
  },
>(appliances: T[], devicePorts: DevicePorts) {
  const usedPortIds = new Set<number>();

  return appliances.map((appliance) => {
    const matchingPort =
      devicePorts.find(
        (port) =>
          port.applianceTypeId === appliance.applianceTypeId
          && !usedPortIds.has(port.devicePortId),
      ) ?? null;

    if (matchingPort) {
      usedPortIds.add(matchingPort.devicePortId);
    }

    return {
      ...appliance,
      devicePortId: matchingPort?.devicePortId ?? null,
      portLabel: matchingPort?.portLabel ?? null,
      applianceUptimeSeconds: matchingPort?.applianceUptimeSeconds ?? null,
    };
  });
}

async function getLandlordOwnedRoomRows(userId: number) {
  const roomIds = await getLandlordRoomIds(userId);

  if (roomIds.length === 0) {
    return [];
  }

  const placeholders = roomIds.map(() => '?').join(', ');
  const [rows] = await pool.query<LandlordRoomRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        tenant.user_id AS tenant_id,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        tenant.user_phone AS tenant_phone,
        device.device_id,
        device.device_name,
        device.device_identifier,
        device.device_last_seen,
        CASE
          WHEN device.device_status = 'online'
            AND device.device_last_seen IS NOT NULL
            AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
          THEN 'online'
          ELSE 'offline'
        END AS computed_status
      FROM tblrooms room
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      LEFT JOIN tbldevices device ON device.device_id = room.room_device_id
      WHERE room.room_id IN (${placeholders})
      ORDER BY room.room_name
    `,
    [env.DEVICE_OFFLINE_MINUTES, ...roomIds],
  );

  return rows;
}

async function buildLandlordRoomSnapshots(userId: number): Promise<LandlordRoomSnapshotInternal[]> {
  const rooms = await getLandlordOwnedRoomRows(userId);

  if (rooms.length === 0) {
    return [];
  }

  const deviceUptimeByDeviceId = await getDeviceUptimeSecondsMap(
    rooms
      .filter((room) => room.device_id !== null)
      .map((room) => ({
        deviceId: room.device_id as number,
        computedStatus: room.computed_status,
        deviceLastSeen: room.device_last_seen,
      })),
  );

  return Promise.all(
    rooms.map(async (room) => {
      const latestReading = await getLatestReadingByRoomId(room.room_id);
      const latestDetection = await getLatestDetectionByRoomId(room.room_id);
      const devicePorts = await getDevicePortsByRoomId(room.room_id);
      const alertSettings = await getRoomAlertSettings(room.room_id);
      const enrichedDetection = latestDetection
        ? {
            ...latestDetection,
            appliances: enrichDetectedAppliancesWithPorts(latestDetection.appliances, devicePorts),
          }
        : null;

      return {
        roomId: room.room_id,
        roomName: room.room_name,
        roomRatePerKwh: room.room_rate_per_kwh,
        roomStatus: room.room_status,
        tenantId: room.tenant_id,
        tenantName: room.tenant_name,
        tenantEmail: room.tenant_email,
        tenantPhone: room.tenant_phone,
        deviceId: room.device_id,
        deviceName: room.device_name,
        deviceIdentifier: room.device_identifier,
        deviceLastSeen: room.device_last_seen,
        computedStatus: room.computed_status,
        deviceUptimeSeconds:
          room.device_id !== null
            ? deviceUptimeByDeviceId.get(room.device_id) ?? null
            : null,
        latestReading,
        latestDetection: enrichedDetection,
        devicePorts,
        alertSettings,
      };
    }),
  );
}

function toPublicRoomSnapshot(snapshot: LandlordRoomSnapshotInternal) {
  return {
    roomId: snapshot.roomId,
    roomName: snapshot.roomName,
    roomRatePerKwh: snapshot.roomRatePerKwh,
    roomStatus: snapshot.roomStatus,
    tenantId: snapshot.tenantId,
    tenantName: snapshot.tenantName,
    tenantEmail: snapshot.tenantEmail,
    tenantPhone: snapshot.tenantPhone,
    deviceId: snapshot.deviceId,
    deviceName: snapshot.deviceName,
    deviceIdentifier: snapshot.deviceIdentifier,
    deviceUptimeSeconds: snapshot.deviceUptimeSeconds,
    estimatedMonthlyCost: getEstimatedMonthlyCost({
      powerW: snapshot.latestReading?.powerW,
      roomRatePerKwh: snapshot.roomRatePerKwh,
      appliances: snapshot.latestDetection?.appliances ?? null,
    }),
    latestReading: snapshot.latestReading,
    latestDetection: snapshot.latestDetection,
    devicePorts: snapshot.devicePorts,
    alertSettings: snapshot.alertSettings,
  };
}

export async function getLandlordDashboard(user: AuthenticatedUser) {
  const roomSnapshots = await buildLandlordRoomSnapshots(user.userId);
  const pendingTenantRequests = await listLandlordPendingTenantRequests(user);
  const occupiedRooms = roomSnapshots.filter((room) => room.roomStatus === 'occupied').length;
  const vacantRooms = roomSnapshots.filter((room) => room.roomStatus === 'available').length;
  const offlineDevices = roomSnapshots.filter(
    (room) => room.deviceId !== null && room.computedStatus === 'offline',
  ).length;
  const totalRealtimeCostPerHour = roomSnapshots.reduce(
    (sum, room) =>
      sum + (getRealtimeCostPerHour(room.latestReading?.powerW, room.roomRatePerKwh) ?? 0),
    0,
  );
  const totalEstimatedMonthlyCost = roomSnapshots.reduce(
    (sum, room) =>
      sum +
        (getEstimatedMonthlyCost({
          powerW: room.latestReading?.powerW,
          roomRatePerKwh: room.roomRatePerKwh,
          appliances: room.latestDetection?.appliances ?? null,
        }) ?? 0),
    0,
  );
  const highestConsumingRoom =
    roomSnapshots
      .filter((room) => room.latestReading)
      .sort((left, right) => (right.latestReading?.powerW ?? 0) - (left.latestReading?.powerW ?? 0))[0]
      ?? null;

  return {
    summary: {
      totalOwnedRooms: roomSnapshots.length,
      occupiedRooms,
      vacantRooms,
      totalRealtimeCostPerHour: Number(totalRealtimeCostPerHour.toFixed(2)),
      totalEstimatedMonthlyCost: Number(totalEstimatedMonthlyCost.toFixed(2)),
      totalTenants: roomSnapshots.filter((room) => room.tenantId !== null).length,
      pendingTenantRequests: pendingTenantRequests.length,
      offlineDevices,
    },
    landlordRegistrationCode: user.landlordRegistrationCode,
    highestConsumingRoom: highestConsumingRoom
      ? {
          roomId: highestConsumingRoom.roomId,
          roomName: highestConsumingRoom.roomName,
          tenantName: highestConsumingRoom.tenantName,
          currentPowerUsage: highestConsumingRoom.latestReading?.powerW ?? null,
          estimatedMonthlyCost: getEstimatedMonthlyCost({
            powerW: highestConsumingRoom.latestReading?.powerW,
            roomRatePerKwh: highestConsumingRoom.roomRatePerKwh,
            appliances: highestConsumingRoom.latestDetection?.appliances ?? null,
          }),
        }
      : null,
    roomSnapshots: roomSnapshots.map(toPublicRoomSnapshot),
  };
}

export async function listLandlordRooms(user: AuthenticatedUser) {
  const roomSnapshots = await buildLandlordRoomSnapshots(user.userId);
  return roomSnapshots.map(toPublicRoomSnapshot);
}

export async function getLandlordRoomDetail(user: AuthenticatedUser, roomId: number) {
  await assertRoomAccess(user, roomId);
  return getOwnedRoomSnapshot(user.userId, roomId);
}

export async function createLandlordRoom(user: AuthenticatedUser, input: CreateLandlordRoomInput) {
  if (!hasPermission(user, 'landlord.rooms.create')) {
    throw new AppError(403, 'Room creation is currently disabled for your landlord account.');
  }

  await assertLandlordRoomNameIsAvailable(input.room_name);

  let roomId: number | null = null;

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
        VALUES (?, ?, NULL, NULL, ?, 'available')
      `,
      [input.room_name.trim(), user.userId, input.room_rate_per_kwh],
    );

    roomId = result.insertId;
  } catch (error) {
    handleDatabaseError(error, 'Unable to create the owned room.');
  }

  if (!roomId) {
    throw new AppError(500, 'Unable to resolve the created room.');
  }

  return getOwnedRoomSnapshot(user.userId, roomId);
}

async function getOwnedRoomSnapshot(userId: number, roomId: number) {
  const roomSnapshots = await buildLandlordRoomSnapshots(userId);
  const snapshot = roomSnapshots.find((room) => room.roomId === roomId);

  if (!snapshot) {
    throw new AppError(404, 'Room not found.');
  }

  return toPublicRoomSnapshot(snapshot);
}

export async function getLandlordRoomManagementOptions(user: AuthenticatedUser, roomId: number) {
  await assertRoomAccess(user, roomId);

  const [tenants, devices] = await Promise.all([
    pool.query<LandlordTenantOptionRow[]>(
      `
        SELECT
          u.user_id,
          u.user_name,
          u.user_email,
          u.user_phone,
          u.user_landlord_id,
          assigned_room.room_id AS assigned_room_id,
          assigned_room.room_name AS assigned_room_name
        FROM tblusers u
        INNER JOIN tblroles r ON r.role_id = u.user_role_id
        INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
        LEFT JOIN tblrooms assigned_room ON assigned_room.room_tenant_id = u.user_id
        WHERE r.role_name = 'tenant'
          AND (
            (
              u.user_landlord_id = ?
              AND s.status_name = 'active'
              AND (assigned_room.room_id IS NULL OR assigned_room.room_id = ?)
            )
            OR assigned_room.room_id = ?
          )
        ORDER BY u.user_name
      `,
      [user.userId, roomId, roomId],
    ),
    pool.query<LandlordDeviceOptionRow[]>(
      `
        SELECT
          device.device_id,
          device.device_name,
          device.device_identifier,
          device.device_last_seen,
          CASE
            WHEN device.device_status = 'online'
              AND device.device_last_seen IS NOT NULL
              AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            THEN 'online'
            ELSE 'offline'
          END AS computed_status,
          assigned_room.room_id AS assigned_room_id,
          assigned_room.room_name AS assigned_room_name
        FROM tbldevices device
        LEFT JOIN tblrooms assigned_room ON assigned_room.room_device_id = device.device_id
        WHERE (
          (
            device.device_owner_landlord_id = ?
            AND (assigned_room.room_id IS NULL OR assigned_room.room_id = ?)
          )
          OR assigned_room.room_id = ?
        )
        ORDER BY device.device_name, device.device_identifier
      `,
      [env.DEVICE_OFFLINE_MINUTES, user.userId, roomId, roomId],
    ),
  ]);

  return {
    tenants: tenants[0].map((tenant) => ({
      userId: tenant.user_id,
      userName: tenant.user_name,
      userEmail: tenant.user_email,
      userPhone: tenant.user_phone,
      assignedRoomId: tenant.assigned_room_id,
      assignedRoomName: tenant.assigned_room_name,
    })),
    devices: devices[0].map((device) => ({
      deviceId: device.device_id,
      deviceName: device.device_name,
      deviceIdentifier: device.device_identifier,
      assignedRoomId: device.assigned_room_id,
      assignedRoomName: device.assigned_room_name,
      computedStatus: device.computed_status,
      deviceLastSeen: device.device_last_seen,
    })),
  };
}

export async function updateLandlordRoom(
  user: AuthenticatedUser,
  roomId: number,
  input: Partial<{
    room_tenant_id: number | null;
    room_device_id: number | null;
    room_rate_per_kwh: number;
    room_status: 'available' | 'occupied';
  }>,
) {
  await assertRoomAccess(user, roomId);
  ensureLandlordRoomUpdatePermission(user, input);

  if (
    input.room_tenant_id !== undefined
    || input.room_device_id !== undefined
    || input.room_status !== undefined
  ) {
    await assertRoomHasNoOpenBillingCycle(
      roomId,
      'This room has an open billing cycle. Close it before changing tenant, device, or occupancy.',
    );
  }

  if (input.room_tenant_id !== undefined && input.room_tenant_id !== null) {
    await assertTenantExists(input.room_tenant_id);
    await assertTenantOwnedByLandlord(input.room_tenant_id, user.userId);
    await assertTenantIsAvailable(input.room_tenant_id, roomId);
  }

  if (input.room_device_id !== undefined && input.room_device_id !== null) {
    await assertDeviceExists(input.room_device_id);
    await assertDeviceOwnedByLandlord(input.room_device_id, user.userId);
    await assertDeviceIsAvailable(input.room_device_id, roomId);
  }

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

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

  if (fields.length === 0) {
    throw new AppError(400, 'At least one editable field is required.');
  }

  try {
    await pool.query(
      `
        UPDATE tblrooms
        SET ${fields.join(', ')}
        WHERE room_id = ? AND room_landlord_id = ?
      `,
      [...values, roomId, user.userId],
    );
  } catch (error) {
    handleDatabaseError(error, 'Unable to update the owned room assignment.');
  }

  return getOwnedRoomSnapshot(user.userId, roomId);
}

export async function updateLandlordRoomAlertSettings(
  user: AuthenticatedUser,
  roomId: number,
  input: {
    warning_power_w: number;
    overload_power_w: number;
    notify_tenant: boolean;
    notify_landlord: boolean;
    notify_admin: boolean;
  },
) {
  await assertRoomAccess(user, roomId);

  if (!hasPermission(user, 'landlord.rooms.update')) {
    throw new AppError(
      403,
      'Room detail updates are currently disabled for your landlord account.',
    );
  }

  await updateRoomAlertSettings(roomId, input);

  return getOwnedRoomSnapshot(user.userId, roomId);
}

export async function listLandlordTenants(user: AuthenticatedUser) {
  const roomSnapshots = await buildLandlordRoomSnapshots(user.userId);

  return roomSnapshots
    .filter((room) => room.tenantId !== null && room.tenantName !== null && room.tenantEmail !== null)
    .map((room) => ({
      tenantId: room.tenantId as number,
      tenantName: room.tenantName as string,
      tenantEmail: room.tenantEmail as string,
      tenantPhone: room.tenantPhone,
      roomId: room.roomId,
      roomName: room.roomName,
      roomRatePerKwh: room.roomRatePerKwh,
      deviceIdentifier: room.deviceIdentifier,
      currentPowerUsage: room.latestReading?.powerW ?? null,
      estimatedMonthlyCost: getEstimatedMonthlyCost({
        powerW: room.latestReading?.powerW,
        roomRatePerKwh: room.roomRatePerKwh,
        appliances: room.latestDetection?.appliances ?? null,
      }),
      latestReadingAt: room.latestReading?.timestamp ?? null,
    }));
}

export async function listLandlordPendingTenantRequests(user: AuthenticatedUser) {
  const [rows] = await pool.query<LandlordPendingTenantRequestRow[]>(
    `
      SELECT
        tenant.user_id AS tenant_id,
        tenant.user_name AS tenant_name,
        tenant.user_email AS tenant_email,
        tenant.user_phone AS tenant_phone,
        tenant.created_at,
        status.status_name,
        landlord.user_id AS landlord_owner_id,
        landlord.user_name AS landlord_owner_name
      FROM tblusers tenant
      INNER JOIN tblroles role ON role.role_id = tenant.user_role_id
      INNER JOIN tbluser_status status ON status.status_id = tenant.user_status_id
      INNER JOIN tblusers landlord ON landlord.user_id = tenant.user_landlord_id
      WHERE role.role_name = 'tenant'
        AND tenant.user_landlord_id = ?
        AND status.status_name = 'pending_approval'
      ORDER BY tenant.created_at DESC, tenant.user_id DESC
    `,
    [user.userId],
  );

  return rows.map((row) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    tenantPhone: row.tenant_phone,
    createdAt: row.created_at,
    statusName: row.status_name,
    landlordOwnerId: row.landlord_owner_id,
    landlordOwnerName: row.landlord_owner_name,
  }));
}

async function updateLandlordPendingTenantRequestStatus(
  user: AuthenticatedUser,
  tenantId: number,
  nextStatusName: 'active' | 'rejected',
) {
  const [rows] = await pool.query<Array<RowDataPacket & { tenant_id: number }>>(
    `
      SELECT tenant.user_id AS tenant_id
      FROM tblusers tenant
      INNER JOIN tblroles role ON role.role_id = tenant.user_role_id
      INNER JOIN tbluser_status status ON status.status_id = tenant.user_status_id
      WHERE tenant.user_id = ?
        AND tenant.user_landlord_id = ?
        AND role.role_name = 'tenant'
        AND status.status_name = 'pending_approval'
      LIMIT 1
    `,
    [tenantId, user.userId],
  );

  if (!rows[0]) {
    throw new AppError(404, 'Pending tenant request not found for this landlord.');
  }

  await pool.query(
    `
      UPDATE tblusers tenant
      INNER JOIN tbluser_status status
        ON status.status_name = ?
      SET tenant.user_status_id = status.status_id
      WHERE tenant.user_id = ?
    `,
    [nextStatusName, tenantId],
  );

  return listLandlordPendingTenantRequests(user);
}

export async function approveLandlordPendingTenantRequest(user: AuthenticatedUser, tenantId: number) {
  return updateLandlordPendingTenantRequestStatus(user, tenantId, 'active');
}

export async function rejectLandlordPendingTenantRequest(user: AuthenticatedUser, tenantId: number) {
  return updateLandlordPendingTenantRequestStatus(user, tenantId, 'rejected');
}

export async function listLandlordDevices(user: AuthenticatedUser) {
  const [rows] = await pool.query<LandlordOwnedDeviceRow[]>(
    `
      SELECT
        device.device_id,
        device.device_name,
        device.device_identifier,
        device.device_status,
        device.device_last_seen,
        CASE
          WHEN device.device_status = 'online'
            AND device.device_last_seen IS NOT NULL
            AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
          THEN 'online'
          ELSE 'offline'
        END AS computed_status,
        room.room_id,
        room.room_name,
        tenant.user_name AS tenant_name
      FROM tbldevices device
      LEFT JOIN tblrooms room ON room.room_device_id = device.device_id
      LEFT JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
      WHERE device.device_owner_landlord_id = ?
      ORDER BY
        CASE WHEN room.room_id IS NULL THEN 1 ELSE 0 END,
        device.device_name,
        device.device_identifier
    `,
    [env.DEVICE_OFFLINE_MINUTES, user.userId],
  );

  const deviceUptimeByDeviceId = await getDeviceUptimeSecondsMap(
    rows.map((row) => ({
      deviceId: row.device_id,
      computedStatus: row.computed_status,
      deviceLastSeen: row.device_last_seen,
    })),
  );

  return Promise.all(
    rows.map(async (row) => {
      const latestReading = row.room_id !== null ? await getLatestReadingByRoomId(row.room_id) : null;

      return {
        deviceId: row.device_id,
        deviceName: row.device_name,
        deviceIdentifier: row.device_identifier,
        roomId: row.room_id,
        roomName: row.room_name,
        tenantName: row.tenant_name,
        computedStatus: row.computed_status,
        deviceLastSeen: row.device_last_seen,
        deviceUptimeSeconds: deviceUptimeByDeviceId.get(row.device_id) ?? null,
        latestPowerW: latestReading?.powerW ?? null,
      };
    }),
  );
}

export async function getLandlordBilling(user: AuthenticatedUser) {
  const roomSnapshots = await buildLandlordRoomSnapshots(user.userId);
  const rooms = roomSnapshots.map((room) => ({
    roomId: room.roomId,
    roomName: room.roomName,
    tenantName: room.tenantName,
    deviceIdentifier: room.deviceIdentifier,
    roomRatePerKwh: room.roomRatePerKwh,
    currentPowerUsage: room.latestReading?.powerW ?? null,
    estimatedMonthlyCost: getEstimatedMonthlyCost({
      powerW: room.latestReading?.powerW,
      roomRatePerKwh: room.roomRatePerKwh,
      appliances: room.latestDetection?.appliances ?? null,
    }),
    latestEnergyKwh: room.latestReading?.energyKwh ?? null,
    latestReadingAt: room.latestReading?.timestamp ?? null,
  }));

  return {
    summary: {
      totalEstimatedMonthlyCost: Number(
        rooms.reduce((sum, room) => sum + (room.estimatedMonthlyCost ?? 0), 0).toFixed(2),
      ),
      totalRealtimeCostPerHour: Number(
        rooms
          .reduce(
            (sum, room) =>
              sum + (getRealtimeCostPerHour(room.currentPowerUsage, room.roomRatePerKwh) ?? 0),
            0,
          )
          .toFixed(2),
      ),
      occupiedRooms: rooms.filter((room) => room.tenantName).length,
      billableRooms: rooms.filter((room) => room.estimatedMonthlyCost !== null).length,
    },
    rooms,
  };
}

import { RowDataPacket } from 'mysql2';

import { env } from '../../config/env';
import { pool } from '../../config/db';
import { AuthenticatedUser } from '../../shared/types/auth';
import { getTenantRoomIds } from '../../shared/utils/room-access';
import { getLatestDetectionByRoomId } from '../detections/detections.service';
import { getDevicePortsByRoomId } from '../device-ports/device-ports.service';
import { getReadingHistoryByRoomId, getLatestReadingByRoomId } from '../readings/readings.service';

interface CountRow extends RowDataPacket {
  total: number;
}

interface TenantRoomRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
  device_id: number;
  device_name: string;
  device_identifier: string;
}

interface AdminRoomRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_rate_per_kwh: number;
  room_status: 'available' | 'occupied';
  tenant_id: number;
  tenant_name: string;
  tenant_email: string;
  device_id: number;
  device_name: string;
  device_identifier: string;
}

interface AdminDeviceRow extends RowDataPacket {
  device_id: number;
  device_name: string;
  device_identifier: string;
  device_status: 'online' | 'offline';
  device_last_seen: string | null;
  computed_status: 'online' | 'offline';
}

export async function getTenantDashboard(user: AuthenticatedUser) {
  const roomIds = await getTenantRoomIds(user.userId);

  if (roomIds.length === 0) {
    return {
      rooms: [],
      summary: {
        totalRooms: 0,
      },
    };
  }

  const [rooms] = await pool.query<TenantRoomRow[]>(
    `
      SELECT
        room.room_id,
        room.room_name,
        room.room_rate_per_kwh,
        room.room_status,
        device.device_id,
        device.device_name,
        device.device_identifier
      FROM tblrooms room
      INNER JOIN tbldevices device ON device.device_id = room.room_device_id
      WHERE room.room_tenant_id = ?
      ORDER BY room.room_name
    `,
    [user.userId],
  );

  const roomSummaries = await Promise.all(
    rooms.map(async (room) => {
      const latestReading = await getLatestReadingByRoomId(room.room_id);
      const latestDetection = await getLatestDetectionByRoomId(room.room_id);
      const recentHistory = await getReadingHistoryByRoomId(room.room_id, 5);
      const devicePorts = await getDevicePortsByRoomId(room.room_id);

      return {
        roomId: room.room_id,
        roomName: room.room_name,
        roomStatus: room.room_status,
        roomRatePerKwh: room.room_rate_per_kwh,
        deviceId: room.device_id,
        deviceName: room.device_name,
        deviceIdentifier: room.device_identifier,
        currentPowerUsage: latestReading?.powerW ?? null,
        latestEnergyKwh: latestReading?.energyKwh ?? null,
        likelyActiveAppliance:
          latestDetection?.applianceTypeName ?? latestReading?.likelyActiveAppliance ?? null,
        detectionConfidence:
          latestDetection?.confidence ?? latestReading?.detectionConfidence ?? null,
        activeAppliances: latestDetection?.appliances ?? [],
        devicePorts,
        estimatedElectricityCost: latestReading?.estimatedCost ?? null,
        latestReadingAt: latestReading?.timestamp ?? null,
        recentHistory,
      };
    }),
  );

  return {
    rooms: roomSummaries,
    summary: {
      totalRooms: roomSummaries.length,
    },
  };
}

export async function getAdminDashboard() {
  const [roomCountResult, deviceCountResult, userCountResult, roomsResult, devicesResult] =
    await Promise.all([
      pool.query<CountRow[]>(
        `
          SELECT COUNT(*) AS total
          FROM tblrooms
        `,
      ),
      pool.query<CountRow[]>(
        `
          SELECT COUNT(*) AS total
          FROM tbldevices
        `,
      ),
      pool.query<CountRow[]>(
        `
          SELECT COUNT(*) AS total
          FROM tblusers
        `,
      ),
      pool.query<AdminRoomRow[]>(
        `
          SELECT
            room.room_id,
            room.room_name,
            room.room_rate_per_kwh,
            room.room_status,
            tenant.user_id AS tenant_id,
            tenant.user_name AS tenant_name,
            tenant.user_email AS tenant_email,
            device.device_id,
            device.device_name,
            device.device_identifier
          FROM tblrooms room
          INNER JOIN tblusers tenant ON tenant.user_id = room.room_tenant_id
          INNER JOIN tbldevices device ON device.device_id = room.room_device_id
          ORDER BY room.room_name
        `,
      ),
      pool.query<AdminDeviceRow[]>(
        `
          SELECT
            d.device_id,
            d.device_name,
            d.device_identifier,
            d.device_status,
            d.device_last_seen,
            CASE
              WHEN d.device_status = 'online'
                AND d.device_last_seen IS NOT NULL
                AND d.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
              THEN 'online'
              ELSE 'offline'
            END AS computed_status
          FROM tbldevices d
          ORDER BY d.device_id
        `,
        [env.DEVICE_OFFLINE_MINUTES],
      ),
    ]);

  const roomCountRow = roomCountResult[0][0];
  const deviceCountRow = deviceCountResult[0][0];
  const userCountRow = userCountResult[0][0];
  const rooms = roomsResult[0];
  const devices = devicesResult[0];

  const roomSummaries = await Promise.all(
    rooms.map(async (room) => {
      const latestReading = await getLatestReadingByRoomId(room.room_id);
      const latestDetection = await getLatestDetectionByRoomId(room.room_id);

      return {
        roomId: room.room_id,
        roomName: room.room_name,
        roomRatePerKwh: room.room_rate_per_kwh,
        roomStatus: room.room_status,
        tenantId: room.tenant_id,
        tenantName: room.tenant_name,
        tenantEmail: room.tenant_email,
        deviceId: room.device_id,
        deviceName: room.device_name,
        deviceIdentifier: room.device_identifier,
        latestReading,
        latestDetection,
      };
    }),
  );

  const highestConsumingRoom =
    roomSummaries
      .filter((room) => room.latestReading)
      .sort(
        (left, right) =>
          (right.latestReading?.powerW ?? 0) - (left.latestReading?.powerW ?? 0),
      )[0] ?? null;

  return {
    totals: {
      totalRooms: roomCountRow.total,
      totalDevices: deviceCountRow.total,
      totalUsers: userCountRow.total,
    },
    highestConsumingRoom: highestConsumingRoom
      ? {
          roomId: highestConsumingRoom.roomId,
          roomName: highestConsumingRoom.roomName,
          tenantName: highestConsumingRoom.tenantName,
          currentPowerUsage: highestConsumingRoom.latestReading?.powerW ?? null,
          estimatedCost: highestConsumingRoom.latestReading?.estimatedCost ?? null,
        }
      : null,
    roomSummaries,
    devices: devices.map((device) => ({
      deviceId: device.device_id,
      deviceName: device.device_name,
      deviceIdentifier: device.device_identifier,
      deviceStatus: device.device_status,
      computedStatus: device.computed_status,
      deviceLastSeen: device.device_last_seen,
    })),
    quickLinks: {
      rooms: '/rooms',
      devices: '/devices',
      users: '/users',
    },
  };
}

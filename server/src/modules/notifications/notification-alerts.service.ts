import { RowDataPacket } from 'mysql2';

import { env } from '../../config/env';
import { pool } from '../../config/db';
import {
  DEFAULT_OVERLOAD_POWER_W,
  DEFAULT_WARNING_POWER_W,
} from '../../shared/constants/notifications';
import { clearNotificationsByReference, createNotificationIfMissing } from './notifications.service';
import { syncDueSoonAndOverdueNotificationsForTenant } from '../billing/billing.service';

interface ActiveAdminRow extends RowDataPacket {
  user_id: number;
}

interface DeviceAlertRow extends RowDataPacket {
  device_id: number;
  device_name: string;
  device_identifier: string;
  device_last_seen: string | null;
  room_id: number | null;
  room_name: string | null;
  room_tenant_id: number | null;
  room_landlord_id: number | null;
  computed_status: 'online' | 'offline';
}

interface RoomPowerAlertRow extends RowDataPacket {
  room_id: number;
  room_name: string;
  room_tenant_id: number | null;
  room_landlord_id: number | null;
  device_identifier: string | null;
  device_last_seen: string | null;
  computed_status: 'online' | 'offline';
  reading_header_id: number | null;
  reading_header_time: string | null;
  reading_detail_power_w: number | null;
  warning_power_w: number;
  overload_power_w: number;
  notify_tenant: number;
  notify_landlord: number;
  notify_admin: number;
}

export interface RoomAlertSettingsRecord {
  roomId: number;
  roomName: string;
  warningPowerW: number;
  overloadPowerW: number;
  notifyTenant: boolean;
  notifyLandlord: boolean;
  notifyAdmin: boolean;
}

let sweepRunning = false;
let sweepInterval: NodeJS.Timeout | null = null;

function getTenantActionPath(
  roomId: number | null,
  focus: 'overview' | 'controls' = 'overview',
  alertType?: 'device_offline' | 'threshold_alert' | 'overload_alert',
) {
  const params = new URLSearchParams();

  if (roomId !== null) {
    params.set('roomId', String(roomId));
  }

  params.set('focus', focus);

  if (alertType) {
    params.set('alert', alertType);
  }

  return `/(app)/dashboard?${params.toString()}`;
}

function getAdminActionPath() {
  return '/(app)/devices';
}

function getLandlordActionPath(roomId: number | null) {
  return roomId ? `/(app)/landlord-room-detail?roomId=${roomId}` : '/(app)/landlord-devices';
}

async function listActiveAdminIds() {
  const [rows] = await pool.query<ActiveAdminRow[]>(
    `
      SELECT user.user_id
      FROM tblusers user
      INNER JOIN tblroles role ON role.role_id = user.user_role_id
      INNER JOIN tbluser_status status ON status.status_id = user.user_status_id
      WHERE role.role_name = 'admin'
        AND status.status_name = 'active'
      ORDER BY user.user_id
    `,
  );

  return rows.map((row) => row.user_id);
}

export async function getRoomAlertSettings(roomId: number) {
  const [rows] = await pool.query<Array<RowDataPacket & {
    room_id: number;
    room_name: string;
    warning_power_w: number | null;
    overload_power_w: number | null;
    notify_tenant: number | null;
    notify_landlord: number | null;
    notify_admin: number | null;
  }>>(
    `
      SELECT
        room.room_id,
        room.room_name,
        settings.room_alert_warning_power_w AS warning_power_w,
        settings.room_alert_overload_power_w AS overload_power_w,
        settings.room_alert_notify_tenant AS notify_tenant,
        settings.room_alert_notify_landlord AS notify_landlord,
        settings.room_alert_notify_admin AS notify_admin
      FROM tblrooms room
      LEFT JOIN tblroom_alert_settings settings
        ON settings.room_alert_room_id = room.room_id
      WHERE room.room_id = ?
      LIMIT 1
    `,
    [roomId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error('Room not found while loading alert settings.');
  }

  return {
    roomId: row.room_id,
    roomName: row.room_name,
    warningPowerW: Number(row.warning_power_w ?? DEFAULT_WARNING_POWER_W),
    overloadPowerW: Number(row.overload_power_w ?? DEFAULT_OVERLOAD_POWER_W),
    notifyTenant: Boolean(row.notify_tenant ?? 1),
    notifyLandlord: Boolean(row.notify_landlord ?? 1),
    notifyAdmin: Boolean(row.notify_admin ?? 1),
  };
}

export async function updateRoomAlertSettings(
  roomId: number,
  input: {
    warning_power_w: number;
    overload_power_w: number;
    notify_tenant: boolean;
    notify_landlord: boolean;
    notify_admin: boolean;
  },
) {
  await pool.query(
    `
      INSERT INTO tblroom_alert_settings (
        room_alert_room_id,
        room_alert_warning_power_w,
        room_alert_overload_power_w,
        room_alert_notify_tenant,
        room_alert_notify_landlord,
        room_alert_notify_admin
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        room_alert_warning_power_w = VALUES(room_alert_warning_power_w),
        room_alert_overload_power_w = VALUES(room_alert_overload_power_w),
        room_alert_notify_tenant = VALUES(room_alert_notify_tenant),
        room_alert_notify_landlord = VALUES(room_alert_notify_landlord),
        room_alert_notify_admin = VALUES(room_alert_notify_admin)
    `,
    [
      roomId,
      input.warning_power_w,
      input.overload_power_w,
      input.notify_tenant ? 1 : 0,
      input.notify_landlord ? 1 : 0,
      input.notify_admin ? 1 : 0,
    ],
  );

  await runNotificationSweep();

  return getRoomAlertSettings(roomId);
}

async function syncDeviceOfflineNotifications() {
  const [deviceRows, adminIds] = await Promise.all([
    pool.query<DeviceAlertRow[]>(
      `
        SELECT
          device.device_id,
          device.device_name,
          device.device_identifier,
          device.device_last_seen,
          room.room_id,
          room.room_name,
          room.room_tenant_id,
          room.room_landlord_id,
          CASE
            WHEN device.device_status = 'online'
              AND device.device_last_seen IS NOT NULL
              AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            THEN 'online'
            ELSE 'offline'
          END AS computed_status
        FROM tbldevices device
        LEFT JOIN tblrooms room ON room.room_device_id = device.device_id
        WHERE room.room_id IS NOT NULL
        ORDER BY device.device_id
      `,
      [env.DEVICE_OFFLINE_MINUTES],
    ),
    listActiveAdminIds(),
  ]);

  const rows = deviceRows[0];

  for (const row of rows) {
    const recipients = new Map<number, string>();

    if (row.room_tenant_id !== null) {
      recipients.set(row.room_tenant_id, getTenantActionPath(row.room_id, 'overview', 'device_offline'));
    }

    if (row.room_landlord_id !== null) {
      recipients.set(row.room_landlord_id, getLandlordActionPath(row.room_id));
    }

    for (const adminId of adminIds) {
      recipients.set(adminId, getAdminActionPath());
    }

    if (row.computed_status === 'offline' && row.device_last_seen) {
      for (const [userId, actionPath] of recipients) {
        await createNotificationIfMissing({
          userId,
          type: 'device_offline',
          title: 'Monitoring device offline',
          message: `${row.device_identifier} in ${row.room_name ?? 'the assigned room'} has gone offline. Last seen: ${row.device_last_seen}.`,
          referenceType: 'device',
          referenceId: row.device_id,
          actionPath,
        });
      }
      continue;
    }

    for (const userId of recipients.keys()) {
      await clearNotificationsByReference({
        userId,
        type: 'device_offline',
        referenceType: 'device',
        referenceId: row.device_id,
      });
    }
  }
}

async function syncRoomPowerNotifications() {
  const [alertRows, adminIds] = await Promise.all([
    pool.query<RoomPowerAlertRow[]>(
      `
        SELECT
          room.room_id,
          room.room_name,
          room.room_tenant_id,
          room.room_landlord_id,
          device.device_identifier,
          device.device_last_seen,
          CASE
            WHEN device.device_status = 'online'
              AND device.device_last_seen IS NOT NULL
              AND device.device_last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            THEN 'online'
            ELSE 'offline'
          END AS computed_status,
          latest_header.reading_header_id,
          latest_header.reading_header_time,
          latest_detail.reading_detail_power_w,
          COALESCE(settings.room_alert_warning_power_w, ?) AS warning_power_w,
          COALESCE(settings.room_alert_overload_power_w, ?) AS overload_power_w,
          COALESCE(settings.room_alert_notify_tenant, 1) AS notify_tenant,
          COALESCE(settings.room_alert_notify_landlord, 1) AS notify_landlord,
          COALESCE(settings.room_alert_notify_admin, 1) AS notify_admin
        FROM tblrooms room
        INNER JOIN tbldevices device ON device.device_id = room.room_device_id
        LEFT JOIN tblroom_alert_settings settings ON settings.room_alert_room_id = room.room_id
        LEFT JOIN tblreading_headers latest_header
          ON latest_header.reading_header_id = (
            SELECT MAX(inner_header.reading_header_id)
            FROM tblreading_headers inner_header
            WHERE inner_header.reading_header_room_id = room.room_id
          )
        LEFT JOIN tblreading_details latest_detail
          ON latest_detail.reading_detail_header_id = latest_header.reading_header_id
        ORDER BY room.room_id
      `,
      [env.DEVICE_OFFLINE_MINUTES, DEFAULT_WARNING_POWER_W, DEFAULT_OVERLOAD_POWER_W],
    ),
    listActiveAdminIds(),
  ]);

  const rows = alertRows[0];

  for (const row of rows) {
    const thresholdRecipients = new Map<number, string>();
    const tenantAlertType =
      row.reading_detail_power_w !== null && row.reading_detail_power_w >= row.overload_power_w
        ? 'overload_alert'
        : 'threshold_alert';

    if (row.notify_tenant && row.room_tenant_id !== null) {
      thresholdRecipients.set(
        row.room_tenant_id,
        getTenantActionPath(
          row.room_id,
          'controls',
          tenantAlertType,
        ),
      );
    }

    if (row.notify_landlord && row.room_landlord_id !== null) {
      thresholdRecipients.set(row.room_landlord_id, getLandlordActionPath(row.room_id));
    }

    if (row.notify_admin) {
      for (const adminId of adminIds) {
        thresholdRecipients.set(adminId, getAdminActionPath());
      }
    }

    const clearAllRoomAlerts = async () => {
      for (const userId of thresholdRecipients.keys()) {
        await clearNotificationsByReference({
          userId,
          type: 'threshold_alert',
          referenceType: 'room',
          referenceId: row.room_id,
        });
        await clearNotificationsByReference({
          userId,
          type: 'overload_alert',
          referenceType: 'room',
          referenceId: row.room_id,
        });
      }
    };

    if (
      row.computed_status !== 'online'
      || row.reading_detail_power_w === null
      || row.reading_header_time === null
    ) {
      await clearAllRoomAlerts();
      continue;
    }

    if (row.reading_detail_power_w >= row.overload_power_w) {
      for (const [userId, actionPath] of thresholdRecipients) {
        await clearNotificationsByReference({
          userId,
          type: 'threshold_alert',
          referenceType: 'room',
          referenceId: row.room_id,
        });
        await createNotificationIfMissing({
          userId,
          type: 'overload_alert',
          title: 'Critical overload alert',
          message: `${row.room_name} reached ${row.reading_detail_power_w.toFixed(2)} W, exceeding the overload threshold of ${row.overload_power_w.toFixed(2)} W.`,
          referenceType: 'room',
          referenceId: row.room_id,
          actionPath,
        });
      }
      continue;
    }

    if (row.reading_detail_power_w >= row.warning_power_w) {
      for (const [userId, actionPath] of thresholdRecipients) {
        await clearNotificationsByReference({
          userId,
          type: 'overload_alert',
          referenceType: 'room',
          referenceId: row.room_id,
        });
        await createNotificationIfMissing({
          userId,
          type: 'threshold_alert',
          title: 'Usage threshold reached',
          message: `${row.room_name} is currently at ${row.reading_detail_power_w.toFixed(2)} W, above the warning threshold of ${row.warning_power_w.toFixed(2)} W.`,
          referenceType: 'room',
          referenceId: row.room_id,
          actionPath,
        });
      }
      continue;
    }

    await clearAllRoomAlerts();
  }
}

async function syncBillingReminderNotifications() {
  const [rows] = await pool.query<Array<RowDataPacket & { tenant_id: number }>>(
    `
      SELECT DISTINCT billing_statement_tenant_id AS tenant_id
      FROM tblbilling_statements
      WHERE billing_statement_status IN ('issued', 'partially_paid')
    `,
  );

  for (const row of rows) {
    await syncDueSoonAndOverdueNotificationsForTenant(row.tenant_id);
  }
}

export async function runNotificationSweep() {
  if (sweepRunning) {
    return;
  }

  sweepRunning = true;

  try {
    await syncDeviceOfflineNotifications();
    await syncRoomPowerNotifications();
    await syncBillingReminderNotifications();
  } finally {
    sweepRunning = false;
  }
}

export function startNotificationJob() {
  if (sweepInterval || env.NODE_ENV === 'test') {
    return;
  }

  void runNotificationSweep().catch((error) => {
    console.error('Initial notification sweep failed.', error);
  });

  sweepInterval = setInterval(() => {
    void runNotificationSweep().catch((error) => {
      console.error('Scheduled notification sweep failed.', error);
    });
  }, env.NOTIFICATION_JOB_INTERVAL_MS);
}

import { QueryResult, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AuthenticatedUser } from '../../shared/types/auth';
import {
  NotificationPreferenceKey,
  getNotificationPreferenceDefinition,
  getNotificationPreferenceDefinitionsForRole,
} from '../../shared/constants/notifications';
import { AppError } from '../../shared/utils/app-error';

type QueryableConnection = {
  query: <T = unknown>(sql: string, values?: unknown[]) => Promise<[T, unknown]>;
};

interface NotificationRow extends RowDataPacket {
  notification_id: number;
  notification_user_id: number;
  notification_type: string;
  notification_title: string;
  notification_message: string;
  notification_reference_type: string | null;
  notification_reference_id: number | null;
  notification_action_path: string | null;
  notification_is_read: number;
  notification_read_at: string | null;
  created_at: string;
  statement_number: string | null;
  statement_total_amount: number | null;
  statement_due_date: string | null;
  statement_room_name: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface NotificationPreferenceRow extends RowDataPacket {
  preference_key: string;
  preference_enabled: number;
  role_name: 'admin' | 'landlord' | 'tenant';
}

async function runQuery<T extends QueryResult>(
  sql: string,
  values?: unknown[],
  connection?: QueryableConnection,
) {
  if (connection) {
    return connection.query<T>(sql, values);
  }

  return pool.query<T>(sql, values as never);
}

function getNotificationCategory(type: string, referenceType: string | null) {
  if (type.startsWith('billing_') || (referenceType?.startsWith('billing_') ?? false)) {
    return 'billing';
  }

  if (type.includes('threshold') || type.includes('overload')) {
    return 'safety';
  }

  if (type.includes('admin') || type.includes('system')) {
    return 'system';
  }

  return 'general';
}

function getNotificationSeverity(type: string) {
  if (
    type.includes('overdue')
    || type.includes('overload')
    || type.includes('offline')
    || type.includes('critical')
  ) {
    return 'critical' as const;
  }

  if (
    type.includes('due_soon')
    || type.includes('threshold')
    || type.includes('rejected')
    || type.includes('submitted')
  ) {
    return 'warning' as const;
  }

  return 'info' as const;
}

function buildNotificationPayload(notification: NotificationRow) {
  return {
    notificationId: notification.notification_id,
    type: notification.notification_type,
    category: getNotificationCategory(
      notification.notification_type,
      notification.notification_reference_type,
    ),
    severity: getNotificationSeverity(notification.notification_type),
    title: notification.notification_title,
    message: notification.notification_message,
    referenceType: notification.notification_reference_type,
    referenceId: notification.notification_reference_id,
    actionPath: notification.notification_action_path,
    isRead: Boolean(notification.notification_is_read),
    readAt: notification.notification_read_at,
    createdAt: notification.created_at,
    statementNumber: notification.statement_number,
    statementTotalAmount: notification.statement_total_amount,
    statementDueDate: notification.statement_due_date,
    statementRoomName: notification.statement_room_name,
  };
}

function buildNotificationSummary(
  notifications: Array<ReturnType<typeof buildNotificationPayload>>,
) {
  return {
    totalNotifications: notifications.length,
    unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
    actionNeededNotifications: notifications.filter(
      (notification) => !notification.isRead || notification.severity !== 'info',
    ).length,
    criticalNotifications: notifications.filter(
      (notification) => notification.severity === 'critical',
    ).length,
  };
}

async function listNotificationRowsWithContext(userId: number, notificationId?: number) {
  const values: Array<number> = [userId];
  let extraWhere = '';

  if (notificationId !== undefined) {
    extraWhere = 'AND notification.notification_id = ?';
    values.push(notificationId);
  }

  const [rows] = await pool.query<NotificationRow[]>(
    `
      SELECT
        notification.*,
        COALESCE(
          statement_direct.billing_statement_number,
          statement_from_payment.billing_statement_number,
          statement_from_receipt.billing_statement_number
        ) AS statement_number,
        COALESCE(
          statement_direct.billing_statement_total_amount,
          statement_from_payment.billing_statement_total_amount,
          statement_from_receipt.billing_statement_total_amount
        ) AS statement_total_amount,
        COALESCE(
          statement_direct.billing_statement_due_date,
          statement_from_payment.billing_statement_due_date,
          statement_from_receipt.billing_statement_due_date
        ) AS statement_due_date,
        COALESCE(
          room_direct.room_name,
          room_from_payment.room_name,
          room_from_receipt.room_name
        ) AS statement_room_name
      FROM tblnotifications notification
      LEFT JOIN tblbilling_statements statement_direct
        ON notification.notification_reference_type = 'billing_statement'
        AND statement_direct.billing_statement_id = notification.notification_reference_id
      LEFT JOIN tblbilling_payments payment_reference
        ON notification.notification_reference_type = 'billing_payment'
        AND payment_reference.billing_payment_id = notification.notification_reference_id
      LEFT JOIN tblbilling_receipts receipt_reference
        ON notification.notification_reference_type = 'billing_receipt'
        AND receipt_reference.billing_receipt_id = notification.notification_reference_id
      LEFT JOIN tblbilling_statements statement_from_payment
        ON statement_from_payment.billing_statement_id = payment_reference.billing_payment_statement_id
      LEFT JOIN tblbilling_statements statement_from_receipt
        ON statement_from_receipt.billing_statement_id = receipt_reference.billing_receipt_statement_id
      LEFT JOIN tblrooms room_direct
        ON room_direct.room_id = statement_direct.billing_statement_room_id
      LEFT JOIN tblrooms room_from_payment
        ON room_from_payment.room_id = statement_from_payment.billing_statement_room_id
      LEFT JOIN tblrooms room_from_receipt
        ON room_from_receipt.room_id = statement_from_receipt.billing_statement_room_id
      WHERE notification.notification_user_id = ?
      ${extraWhere}
      ORDER BY notification.created_at DESC, notification.notification_id DESC
    `,
    values,
  );

  return rows;
}

async function isNotificationEnabledForUser(userId: number, type: string) {
  const definition = getNotificationPreferenceDefinition(type);

  if (!definition) {
    return true;
  }

  const [rows] = await pool.query<NotificationPreferenceRow[]>(
    `
      SELECT
        pref.preference_key,
        pref.preference_enabled,
        role.role_name
      FROM tblusers user_account
      INNER JOIN tblroles role ON role.role_id = user_account.user_role_id
      LEFT JOIN tblnotification_preferences pref
        ON pref.preference_user_id = user_account.user_id
        AND pref.preference_key = ?
      WHERE user_account.user_id = ?
      LIMIT 1
    `,
    [type, userId],
  );

  const row = rows[0];

  if (!row) {
    return definition.defaultEnabled;
  }

  if (!definition.roles.includes(row.role_name)) {
    return false;
  }

  if (row.preference_key) {
    return Boolean(row.preference_enabled);
  }

  return definition.defaultEnabled;
}

export async function notificationAlreadyExists(
  userId: number,
  type: string,
  referenceType: string | null,
  referenceId: number | null,
  connection?: QueryableConnection,
) {
  const [rows] = await runQuery<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM tblnotifications
      WHERE notification_user_id = ?
        AND notification_type = ?
        AND (
          (? IS NULL AND notification_reference_type IS NULL)
          OR notification_reference_type = ?
        )
        AND (
          (? IS NULL AND notification_reference_id IS NULL)
          OR notification_reference_id = ?
        )
    `,
    [userId, type, referenceType, referenceType, referenceId, referenceId],
    connection,
  );

  return (rows[0]?.total ?? 0) > 0;
}

export async function createNotification(
  input: {
    userId: number;
    type: string;
    title: string;
    message: string;
    referenceType?: string | null;
    referenceId?: number | null;
    actionPath?: string | null;
  },
  connection?: QueryableConnection,
) {
  if (!(await isNotificationEnabledForUser(input.userId, input.type))) {
    return;
  }

  await runQuery(
    `
      INSERT INTO tblnotifications (
        notification_user_id,
        notification_type,
        notification_title,
        notification_message,
        notification_reference_type,
        notification_reference_id,
        notification_action_path
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.userId,
      input.type,
      input.title,
      input.message,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.actionPath ?? null,
    ],
    connection,
  );
}

export async function createNotificationIfMissing(
  input: {
    userId: number;
    type: string;
    title: string;
    message: string;
    referenceType?: string | null;
    referenceId?: number | null;
    actionPath?: string | null;
  },
  connection?: QueryableConnection,
) {
  const referenceType = input.referenceType ?? null;
  const referenceId = input.referenceId ?? null;

  if (
    await notificationAlreadyExists(
      input.userId,
      input.type,
      referenceType,
      referenceId,
      connection,
    )
  ) {
    return;
  }

  await createNotification(
    {
      ...input,
      referenceType,
      referenceId,
    },
    connection,
  );
}

export async function clearNotificationsByReference(
  input: {
    userId: number;
    type: string;
    referenceType?: string | null;
    referenceId?: number | null;
  },
  connection?: QueryableConnection,
) {
  await runQuery(
    `
      DELETE FROM tblnotifications
      WHERE notification_user_id = ?
        AND notification_type = ?
        AND (
          (? IS NULL AND notification_reference_type IS NULL)
          OR notification_reference_type = ?
        )
        AND (
          (? IS NULL AND notification_reference_id IS NULL)
          OR notification_reference_id = ?
        )
    `,
    [
      input.userId,
      input.type,
      input.referenceType ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.referenceId ?? null,
    ],
    connection,
  );
}

export async function listNotificationPreferences(user: AuthenticatedUser) {
  const definitions = getNotificationPreferenceDefinitionsForRole(user.roleName);
  const keys = definitions.map((definition) => definition.key);

  if (keys.length === 0) {
    return {
      summary: {
        totalPreferences: 0,
        enabledPreferences: 0,
      },
      preferences: [],
    };
  }

  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await pool.query<Array<RowDataPacket & {
    preference_key: string;
    preference_enabled: number;
  }>>(
    `
      SELECT
        preference_key,
        preference_enabled
      FROM tblnotification_preferences
      WHERE preference_user_id = ?
        AND preference_key IN (${placeholders})
    `,
    [user.userId, ...keys],
  );

  const storedValues = new Map(rows.map((row) => [row.preference_key, Boolean(row.preference_enabled)]));
  const preferences = definitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    enabled: storedValues.get(definition.key) ?? definition.defaultEnabled,
    defaultEnabled: definition.defaultEnabled,
  }));

  return {
    summary: {
      totalPreferences: preferences.length,
      enabledPreferences: preferences.filter((preference) => preference.enabled).length,
    },
    preferences,
  };
}

export async function updateNotificationPreference(
  user: AuthenticatedUser,
  input: {
    preference_key: string;
    enabled: boolean;
  },
) {
  const definition = getNotificationPreferenceDefinition(input.preference_key);

  if (!definition || !definition.roles.includes(user.roleName)) {
    throw new AppError(404, 'Notification preference not found for this account.');
  }

  await pool.query(
    `
      INSERT INTO tblnotification_preferences (
        preference_user_id,
        preference_key,
        preference_enabled
      )
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE preference_enabled = VALUES(preference_enabled)
    `,
    [user.userId, input.preference_key, input.enabled ? 1 : 0],
  );

  const preferences = await listNotificationPreferences(user);
  const updatedPreference = preferences.preferences.find(
    (preference) => preference.key === input.preference_key,
  );

  if (!updatedPreference) {
    throw new AppError(500, 'Notification preference was updated but could not be loaded afterward.');
  }

  return updatedPreference;
}

export async function listNotifications(user: AuthenticatedUser) {
  const notificationRows = await listNotificationRowsWithContext(user.userId);
  const notifications = notificationRows.map(buildNotificationPayload);

  return {
    summary: buildNotificationSummary(notifications),
    notifications,
  };
}

export async function getNotificationSummary(user: AuthenticatedUser) {
  const notificationRows = await listNotificationRowsWithContext(user.userId);
  const notifications = notificationRows.map(buildNotificationPayload);

  return buildNotificationSummary(notifications);
}

export async function markNotificationAsRead(
  user: AuthenticatedUser,
  notificationId: number,
) {
  const notification = (await listNotificationRowsWithContext(user.userId, notificationId))[0];

  if (!notification) {
    throw new AppError(404, 'Notification not found.');
  }

  if (!notification.notification_is_read) {
    await pool.query(
      `
        UPDATE tblnotifications
        SET
          notification_is_read = 1,
          notification_read_at = NOW()
        WHERE notification_id = ?
          AND notification_user_id = ?
      `,
      [notificationId, user.userId],
    );
  }

  const updatedNotification = (await listNotificationRowsWithContext(user.userId, notificationId))[0];

  return buildNotificationPayload(updatedNotification);
}

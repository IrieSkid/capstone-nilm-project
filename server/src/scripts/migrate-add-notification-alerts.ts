import { RowDataPacket } from 'mysql2';

import { pool } from '../config/db';

interface ExistsRow extends RowDataPacket {
  total: number;
}

async function tableExists(tableName: string) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName],
  );

  return (rows[0]?.total ?? 0) > 0;
}

async function indexExists(tableName: string, indexName: string) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName],
  );

  return (rows[0]?.total ?? 0) > 0;
}

async function ensureNotificationPreferencesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblnotification_preferences (
      notification_preference_id INT PRIMARY KEY AUTO_INCREMENT,
      preference_user_id INT NOT NULL,
      preference_key VARCHAR(60) NOT NULL,
      preference_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_notification_preferences_user FOREIGN KEY (preference_user_id) REFERENCES tblusers(user_id),
      CONSTRAINT uq_notification_preferences_user_key UNIQUE (preference_user_id, preference_key)
    )
  `);

  if (!(await indexExists('tblnotification_preferences', 'idx_notification_preferences_user'))) {
    await pool.query(`
      CREATE INDEX idx_notification_preferences_user
      ON tblnotification_preferences (preference_user_id, preference_enabled)
    `);
  }
}

async function ensureRoomAlertSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblroom_alert_settings (
      room_alert_setting_id INT PRIMARY KEY AUTO_INCREMENT,
      room_alert_room_id INT NOT NULL UNIQUE,
      room_alert_warning_power_w DECIMAL(10, 2) NOT NULL DEFAULT 1200.00,
      room_alert_overload_power_w DECIMAL(10, 2) NOT NULL DEFAULT 1800.00,
      room_alert_notify_tenant TINYINT(1) NOT NULL DEFAULT 1,
      room_alert_notify_landlord TINYINT(1) NOT NULL DEFAULT 1,
      room_alert_notify_admin TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_room_alert_settings_room FOREIGN KEY (room_alert_room_id) REFERENCES tblrooms(room_id)
    )
  `);

  if (!(await indexExists('tblroom_alert_settings', 'idx_room_alert_settings_room'))) {
    await pool.query(`
      CREATE INDEX idx_room_alert_settings_room
      ON tblroom_alert_settings (room_alert_room_id)
    `);
  }

  if (await tableExists('tblrooms')) {
    await pool.query(`
      INSERT INTO tblroom_alert_settings (
        room_alert_room_id,
        room_alert_warning_power_w,
        room_alert_overload_power_w,
        room_alert_notify_tenant,
        room_alert_notify_landlord,
        room_alert_notify_admin
      )
      SELECT
        room_id,
        1200.00,
        1800.00,
        1,
        1,
        1
      FROM tblrooms
      ON DUPLICATE KEY UPDATE room_alert_room_id = room_alert_room_id
    `);
  }
}

async function main() {
  await ensureNotificationPreferencesTable();
  await ensureRoomAlertSettingsTable();

  console.log('Notification alert preferences and room alert settings are ready.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate notification alerts.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

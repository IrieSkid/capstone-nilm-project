import { RowDataPacket } from 'mysql2';

import { pool } from '../config/db';

interface IndexCountRow extends RowDataPacket {
  index_count: number;
}

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbldevice_heartbeats (
      heartbeat_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      heartbeat_device_id INT NOT NULL,
      heartbeat_device_time DATETIME NULL,
      heartbeat_uptime_seconds BIGINT UNSIGNED NOT NULL,
      heartbeat_wifi_rssi_dbm SMALLINT NULL,
      heartbeat_pzem_ok TINYINT(1) NOT NULL,
      heartbeat_last_reading_http_status SMALLINT NULL,
      heartbeat_firmware_version VARCHAR(30) NOT NULL,
      heartbeat_error_code VARCHAR(100) NULL,
      heartbeat_received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_device_heartbeats_device
        FOREIGN KEY (heartbeat_device_id) REFERENCES tbldevices(device_id),
      CONSTRAINT uq_device_heartbeats_device UNIQUE (heartbeat_device_id),
      INDEX idx_device_heartbeats_device_received (
        heartbeat_device_id,
        heartbeat_received_at
      )
    )
  `);

  const [indexRows] = await pool.query<IndexCountRow[]>(`
    SELECT COUNT(*) AS index_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'tbldevice_heartbeats'
      AND index_name = 'uq_device_heartbeats_device'
  `);

  if (Number(indexRows[0]?.index_count ?? 0) === 0) {
    await pool.query(`
      ALTER TABLE tbldevice_heartbeats
      ADD CONSTRAINT uq_device_heartbeats_device UNIQUE (heartbeat_device_id)
    `);
  }

  console.log('Device heartbeat snapshot storage is ready.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate device heartbeat storage.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

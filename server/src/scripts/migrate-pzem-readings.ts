import { pool } from '../config/db';

async function main() {
  await pool.query(`
    ALTER TABLE tblreading_details
    MODIFY reading_detail_thd_percentage DECIMAL(5, 2) NULL
  `);

  await pool.query(`
    ALTER TABLE tblappliance_detection_details
    MODIFY detection_detail_detected_thd DECIMAL(5, 2) NULL
  `);

  console.log('PZEM-compatible optional THD columns are ready.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate PZEM-compatible readings.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

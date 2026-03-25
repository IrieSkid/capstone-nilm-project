import { pool } from '../config/db';

async function main() {
  await pool.query(`
    ALTER TABLE tblrooms
    MODIFY room_tenant_id INT NULL
  `);

  await pool.query(`
    ALTER TABLE tblrooms
    MODIFY room_device_id INT NULL UNIQUE
  `);

  await pool.query(`
    ALTER TABLE tblrooms
    MODIFY room_status ENUM('available', 'occupied') NOT NULL DEFAULT 'available'
  `);

  console.log('tblrooms now allows unassigned tenant/device references.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate tblrooms.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

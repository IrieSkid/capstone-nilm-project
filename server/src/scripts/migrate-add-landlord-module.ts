import { RowDataPacket } from 'mysql2';

import { pool } from '../config/db';
import { AppModuleKey } from '../shared/types/auth';
import { generateUniqueLandlordRegistrationCode } from '../shared/utils/landlord-code';

interface ExistsRow extends RowDataPacket {
  total: number;
}

interface IdRow extends RowDataPacket {
  id: number;
}

const LANDLORD_PERMISSIONS: Array<{
  key: AppModuleKey;
  name: string;
  description: string;
}> = [
  {
    key: 'tenant.billing.view',
    name: 'Tenant Billing View',
    description: 'Allows tenants to view their active billing cycle and projected current bill.',
  },
  {
    key: 'landlord.dashboard.view',
    name: 'Landlord Dashboard View',
    description: 'Allows landlords to view their owned-room dashboard.',
  },
  {
    key: 'landlord.rooms.view',
    name: 'Landlord Rooms View',
    description: 'Allows landlords to view rooms assigned to them.',
  },
  {
    key: 'landlord.rooms.create',
    name: 'Landlord Rooms Create',
    description: 'Allows landlords to create new rooms under their own ownership.',
  },
  {
    key: 'landlord.rooms.update',
    name: 'Landlord Rooms Update',
    description: 'Allows landlords to update owned room rate, status, and room details allowed by policy.',
  },
  {
    key: 'landlord.tenants.view',
    name: 'Landlord Tenants View',
    description: 'Allows landlords to view tenants in their owned rooms.',
  },
  {
    key: 'landlord.tenants.assign',
    name: 'Landlord Tenants Assign',
    description: 'Allows landlords to assign or unassign tenants in their owned rooms.',
  },
  {
    key: 'landlord.tenant_requests.view',
    name: 'Landlord Tenant Requests View',
    description: 'Allows landlords to view pending tenant registrations linked to their invite code.',
  },
  {
    key: 'landlord.tenant_requests.approve',
    name: 'Landlord Tenant Requests Approve',
    description: 'Allows landlords to approve or reject pending tenant registrations.',
  },
  {
    key: 'landlord.billing.view',
    name: 'Landlord Billing View',
    description: 'Allows landlords to view billing summaries for their owned rooms.',
  },
  {
    key: 'landlord.billing.manage',
    name: 'Landlord Billing Manage',
    description: 'Allows landlords to open and close billing cycles for their owned rooms.',
  },
  {
    key: 'landlord.devices.view',
    name: 'Landlord Devices View',
    description: 'Allows landlords to view devices assigned to their owned rooms.',
  },
  {
    key: 'landlord.devices.assign',
    name: 'Landlord Devices Assign',
    description: 'Allows landlords to assign or unassign devices in their owned rooms.',
  },
];

async function columnExists(tableName: string, columnName: string) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName],
  );

  return (rows[0]?.total ?? 0) > 0;
}

async function constraintExists(tableName: string, constraintName: string) {
  const [rows] = await pool.query<ExistsRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
    `,
    [tableName, constraintName],
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

async function resolveId(table: 'tblroles' | 'tblapp_modules', keyColumn: string, keyValue: string) {
  const idColumn = table === 'tblroles' ? 'role_id' : 'module_id';
  const [rows] = await pool.query<IdRow[]>(
    `SELECT ${idColumn} AS id FROM ${table} WHERE ${keyColumn} = ? LIMIT 1`,
    [keyValue],
  );

  return rows[0]?.id ?? null;
}

async function ensureLandlordRoomOwnershipColumn() {
  if (!(await columnExists('tblrooms', 'room_landlord_id'))) {
    await pool.query(`
      ALTER TABLE tblrooms
      ADD COLUMN room_landlord_id INT NULL AFTER room_name
    `);
  }

  if (!(await constraintExists('tblrooms', 'fk_rooms_landlord'))) {
    await pool.query(`
      ALTER TABLE tblrooms
      ADD CONSTRAINT fk_rooms_landlord
      FOREIGN KEY (room_landlord_id) REFERENCES tblusers(user_id)
    `);
  }

  if (!(await indexExists('tblrooms', 'idx_rooms_landlord'))) {
    await pool.query(`
      CREATE INDEX idx_rooms_landlord ON tblrooms (room_landlord_id)
    `);
  }
}

async function ensureDeviceOwnerLandlordColumn() {
  if (!(await columnExists('tbldevices', 'device_owner_landlord_id'))) {
    await pool.query(`
      ALTER TABLE tbldevices
      ADD COLUMN device_owner_landlord_id INT NULL AFTER device_identifier
    `);
  }

  if (!(await constraintExists('tbldevices', 'fk_devices_owner_landlord'))) {
    await pool.query(`
      ALTER TABLE tbldevices
      ADD CONSTRAINT fk_devices_owner_landlord
      FOREIGN KEY (device_owner_landlord_id) REFERENCES tblusers(user_id)
    `);
  }

  if (!(await indexExists('tbldevices', 'idx_devices_owner_landlord'))) {
    await pool.query(`
      CREATE INDEX idx_devices_owner_landlord ON tbldevices (device_owner_landlord_id)
    `);
  }
}

async function ensureTenantLandlordOwnershipColumn() {
  if (!(await columnExists('tblusers', 'user_landlord_id'))) {
    await pool.query(`
      ALTER TABLE tblusers
      ADD COLUMN user_landlord_id INT NULL AFTER user_status_id
    `);
  }

  if (!(await constraintExists('tblusers', 'fk_users_landlord'))) {
    await pool.query(`
      ALTER TABLE tblusers
      ADD CONSTRAINT fk_users_landlord
      FOREIGN KEY (user_landlord_id) REFERENCES tblusers(user_id)
    `);
  }

  if (!(await indexExists('tblusers', 'idx_users_landlord_owner'))) {
    await pool.query(`
      CREATE INDEX idx_users_landlord_owner ON tblusers (user_landlord_id)
    `);
  }
}

async function ensureLandlordRegistrationCodeColumn() {
  if (!(await columnExists('tblusers', 'landlord_registration_code'))) {
    await pool.query(`
      ALTER TABLE tblusers
      ADD COLUMN landlord_registration_code VARCHAR(30) NULL AFTER user_landlord_id
    `);
  }

  if (!(await indexExists('tblusers', 'landlord_registration_code'))) {
    await pool.query(`
      ALTER TABLE tblusers
      ADD UNIQUE INDEX landlord_registration_code (landlord_registration_code)
    `);
  }
}

async function ensureUserStatuses() {
  for (const statusName of ['active', 'inactive', 'suspended', 'pending_approval', 'rejected']) {
    await pool.query(
      `
        INSERT INTO tbluser_status (status_name)
        VALUES (?)
        ON DUPLICATE KEY UPDATE status_name = VALUES(status_name)
      `,
      [statusName],
    );
  }
}

async function ensureLandlordPermissionCatalog() {
  for (const permission of LANDLORD_PERMISSIONS) {
    await pool.query(
      `
        INSERT INTO tblapp_modules (module_key, module_name, module_description)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          module_name = VALUES(module_name),
          module_description = VALUES(module_description)
      `,
      [permission.key, permission.name, permission.description],
    );
  }
}

async function ensureRolePermission(roleId: number, moduleId: number, canAccess = 1) {
  await pool.query(
    `
      INSERT INTO tblrole_module_permissions (
        role_permission_role_id,
        role_permission_module_id,
        can_access
      )
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
    `,
    [roleId, moduleId, canAccess],
  );
}

async function ensureLandlordRolePermissions() {
  const adminRoleId = await resolveId('tblroles', 'role_name', 'admin');
  const landlordRoleId = await resolveId('tblroles', 'role_name', 'landlord');
  const tenantRoleId = await resolveId('tblroles', 'role_name', 'tenant');

  if (!adminRoleId || !landlordRoleId || !tenantRoleId) {
    throw new Error('Admin, landlord, and tenant roles must exist before running the landlord migration.');
  }

  for (const permission of LANDLORD_PERMISSIONS) {
    const moduleId = await resolveId('tblapp_modules', 'module_key', permission.key);

    if (!moduleId) {
      throw new Error(`Permission ${permission.key} was not found after sync.`);
    }

    await ensureRolePermission(adminRoleId, moduleId, 1);

    if (permission.key !== 'tenant.billing.view') {
      await ensureRolePermission(landlordRoleId, moduleId, 1);
    }
  }

  const tenantBillingModuleId = await resolveId(
    'tblapp_modules',
    'module_key',
    'tenant.billing.view',
  );

  if (tenantBillingModuleId) {
    await ensureRolePermission(adminRoleId, tenantBillingModuleId, 1);
    await ensureRolePermission(tenantRoleId, tenantBillingModuleId, 1);
  }
}

async function backfillTenantLandlordOwnership() {
  await pool.query(
    `
      UPDATE tblusers tenant
      INNER JOIN tblroles tenant_role ON tenant_role.role_id = tenant.user_role_id
      INNER JOIN tblrooms room ON room.room_tenant_id = tenant.user_id
      SET tenant.user_landlord_id = room.room_landlord_id
      WHERE tenant_role.role_name = 'tenant'
        AND tenant.user_landlord_id IS NULL
        AND room.room_landlord_id IS NOT NULL
    `,
  );
}

async function backfillDeviceLandlordOwnership() {
  await pool.query(
    `
      UPDATE tbldevices device
      INNER JOIN tblrooms room ON room.room_device_id = device.device_id
      SET device.device_owner_landlord_id = room.room_landlord_id
      WHERE device.device_owner_landlord_id IS NULL
        AND room.room_landlord_id IS NOT NULL
    `,
  );
}

async function backfillLandlordRegistrationCodes() {
  const [rows] = await pool.query<Array<RowDataPacket & { user_id: number }>>(
    `
      SELECT u.user_id
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      WHERE r.role_name = 'landlord'
        AND (u.landlord_registration_code IS NULL OR u.landlord_registration_code = '')
      ORDER BY u.user_id
    `,
  );

  for (const row of rows) {
    const landlordRegistrationCode = await generateUniqueLandlordRegistrationCode(pool);

    await pool.query(
      `
        UPDATE tblusers
        SET landlord_registration_code = ?
        WHERE user_id = ?
      `,
      [landlordRegistrationCode, row.user_id],
    );
  }
}

async function main() {
  await ensureLandlordRoomOwnershipColumn();
  await ensureDeviceOwnerLandlordColumn();
  await ensureTenantLandlordOwnershipColumn();
  await ensureLandlordRegistrationCodeColumn();
  await ensureUserStatuses();
  await ensureLandlordPermissionCatalog();
  await ensureLandlordRolePermissions();
  await backfillTenantLandlordOwnership();
  await backfillDeviceLandlordOwnership();
  await backfillLandlordRegistrationCodes();

  console.log('Landlord ownership, invite code, tenant approval, and device ownership are ready.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate landlord module.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

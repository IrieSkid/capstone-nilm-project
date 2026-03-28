import { RowDataPacket } from 'mysql2';

import { pool } from '../config/db';
import { AppModuleKey, RoleName } from '../shared/types/auth';

interface IdRow extends RowDataPacket {
  id: number;
}

const PERMISSIONS: Array<{
  key: AppModuleKey;
  name: string;
  description: string;
}> = [
  { key: 'dashboard.view', name: 'Dashboard View', description: 'Allows access to the main monitoring dashboard.' },
  { key: 'profile.manage', name: 'Profile Manage', description: 'Allows users to update their own profile and password.' },
  { key: 'users.view', name: 'Users View', description: 'Allows viewing the user management list.' },
  { key: 'users.create', name: 'Users Create', description: 'Allows creating new user accounts.' },
  { key: 'users.update', name: 'Users Update', description: 'Allows updating existing user accounts.' },
  { key: 'rooms.view', name: 'Rooms View', description: 'Allows viewing the room management list.' },
  { key: 'rooms.create', name: 'Rooms Create', description: 'Allows creating new rooms.' },
  { key: 'rooms.update', name: 'Rooms Update', description: 'Allows updating room details and assignments.' },
  { key: 'rooms.delete', name: 'Rooms Delete', description: 'Allows deleting fully unassigned rooms.' },
  { key: 'devices.view', name: 'Devices View', description: 'Allows viewing the device registry list.' },
  { key: 'devices.create', name: 'Devices Create', description: 'Allows registering new devices.' },
  { key: 'devices.update', name: 'Devices Update', description: 'Allows updating existing devices.' },
  { key: 'tenant.billing.view', name: 'Tenant Billing View', description: 'Allows tenants to view their active billing cycle and projected current bill.' },
  { key: 'port_control.use', name: 'Port Control Use', description: 'Allows remote on/off control of assigned device ports.' },
  { key: 'landlord.dashboard.view', name: 'Landlord Dashboard View', description: 'Allows landlords to view their owned-room dashboard.' },
  { key: 'landlord.rooms.view', name: 'Landlord Rooms View', description: 'Allows landlords to view rooms assigned to them.' },
  { key: 'landlord.rooms.create', name: 'Landlord Rooms Create', description: 'Allows landlords to create new rooms under their own ownership.' },
  { key: 'landlord.rooms.update', name: 'Landlord Rooms Update', description: 'Allows landlords to update owned room rate, status, and room details allowed by policy.' },
  { key: 'landlord.tenants.view', name: 'Landlord Tenants View', description: 'Allows landlords to view tenants in their owned rooms.' },
  { key: 'landlord.tenants.assign', name: 'Landlord Tenants Assign', description: 'Allows landlords to assign or unassign tenants in their owned rooms.' },
  { key: 'landlord.tenant_requests.view', name: 'Landlord Tenant Requests View', description: 'Allows landlords to view pending tenant registrations linked to their invite code.' },
  { key: 'landlord.tenant_requests.approve', name: 'Landlord Tenant Requests Approve', description: 'Allows landlords to approve or reject pending tenant registrations.' },
  { key: 'landlord.billing.view', name: 'Landlord Billing View', description: 'Allows landlords to view billing summaries for their owned rooms.' },
  { key: 'landlord.billing.manage', name: 'Landlord Billing Manage', description: 'Allows landlords to open and close billing cycles for their owned rooms.' },
  { key: 'landlord.devices.view', name: 'Landlord Devices View', description: 'Allows landlords to view devices assigned to their owned rooms.' },
  { key: 'landlord.devices.assign', name: 'Landlord Devices Assign', description: 'Allows landlords to assign or unassign devices in their owned rooms.' },
  { key: 'rbac.manage', name: 'RBAC Manage', description: 'Allows managing role and user access control settings.' },
];

const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, AppModuleKey[]> = {
  admin: PERMISSIONS.map((permission) => permission.key),
  tenant: ['dashboard.view', 'profile.manage', 'tenant.billing.view', 'port_control.use'],
  landlord: [
    'profile.manage',
    'landlord.dashboard.view',
    'landlord.rooms.view',
    'landlord.rooms.create',
    'landlord.rooms.update',
    'landlord.tenants.view',
    'landlord.tenants.assign',
    'landlord.tenant_requests.view',
    'landlord.tenant_requests.approve',
    'landlord.billing.view',
    'landlord.billing.manage',
    'landlord.devices.view',
    'landlord.devices.assign',
  ],
};

async function resolveId(table: 'tblroles' | 'tblapp_modules', keyColumn: string, keyValue: string) {
  const idColumn = table === 'tblroles' ? 'role_id' : 'module_id';
  const [rows] = await pool.query<IdRow[]>(
    `SELECT ${idColumn} AS id FROM ${table} WHERE ${keyColumn} = ? LIMIT 1`,
    [keyValue],
  );

  return rows[0]?.id ?? null;
}

async function insertRolePermissions(roleId: number, permissionKeys: AppModuleKey[]) {
  const valueClauses: string[] = [];
  const params: number[] = [];

  for (const permissionKey of permissionKeys) {
    const moduleId = await resolveId('tblapp_modules', 'module_key', permissionKey);

    if (!moduleId) {
      throw new Error(`Permission ${permissionKey} was not found after reseeding.`);
    }

    valueClauses.push('(?, ?, 1)');
    params.push(roleId, moduleId);
  }

  if (valueClauses.length === 0) {
    return;
  }

  await pool.query(
    `
      INSERT INTO tblrole_module_permissions (
        role_permission_role_id,
        role_permission_module_id,
        can_access
      )
      VALUES ${valueClauses.join(', ')}
    `,
    params,
  );
}

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblapp_modules (
      module_id INT PRIMARY KEY AUTO_INCREMENT,
      module_key VARCHAR(50) NOT NULL UNIQUE,
      module_name VARCHAR(100) NOT NULL,
      module_description VARCHAR(255) NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblrole_module_permissions (
      role_permission_id INT PRIMARY KEY AUTO_INCREMENT,
      role_permission_role_id INT NOT NULL,
      role_permission_module_id INT NOT NULL,
      can_access TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_permission_role_id) REFERENCES tblroles(role_id),
      CONSTRAINT fk_role_permissions_module FOREIGN KEY (role_permission_module_id) REFERENCES tblapp_modules(module_id),
      CONSTRAINT uq_role_module_permission UNIQUE (role_permission_role_id, role_permission_module_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbluser_module_permissions (
      user_permission_id INT PRIMARY KEY AUTO_INCREMENT,
      user_permission_user_id INT NOT NULL,
      user_permission_module_id INT NOT NULL,
      can_access TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_permission_user_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_user_permissions_module FOREIGN KEY (user_permission_module_id) REFERENCES tblapp_modules(module_id),
      CONSTRAINT uq_user_module_permission UNIQUE (user_permission_user_id, user_permission_module_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tblrbac_audit_logs (
      audit_log_id INT PRIMARY KEY AUTO_INCREMENT,
      changed_by_user_id INT NOT NULL,
      target_scope ENUM('role', 'user') NOT NULL,
      target_role_id INT NULL,
      target_user_id INT NULL,
      target_module_id INT NOT NULL,
      previous_state VARCHAR(20) NOT NULL,
      next_state VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_rbac_audit_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_rbac_audit_role FOREIGN KEY (target_role_id) REFERENCES tblroles(role_id),
      CONSTRAINT fk_rbac_audit_user FOREIGN KEY (target_user_id) REFERENCES tblusers(user_id),
      CONSTRAINT fk_rbac_audit_module FOREIGN KEY (target_module_id) REFERENCES tblapp_modules(module_id)
    )
  `);

  await pool.query('DELETE FROM tblrbac_audit_logs');
  await pool.query('DELETE FROM tbluser_module_permissions');
  await pool.query('DELETE FROM tblrole_module_permissions');
  await pool.query('DELETE FROM tblapp_modules');

  await pool.query(
    `
      INSERT INTO tblapp_modules (module_key, module_name, module_description)
      VALUES ${PERMISSIONS.map(() => '(?, ?, ?)').join(', ')}
    `,
    PERMISSIONS.flatMap((permission) => [permission.key, permission.name, permission.description]),
  );

  const adminRoleId = await resolveId('tblroles', 'role_name', 'admin');
  const landlordRoleId = await resolveId('tblroles', 'role_name', 'landlord');
  const tenantRoleId = await resolveId('tblroles', 'role_name', 'tenant');

  if (!adminRoleId || !landlordRoleId || !tenantRoleId) {
    throw new Error('Required roles were not found. Reset or seed the database first.');
  }

  await insertRolePermissions(adminRoleId, DEFAULT_ROLE_PERMISSIONS.admin);
  await insertRolePermissions(tenantRoleId, DEFAULT_ROLE_PERMISSIONS.tenant);
  await insertRolePermissions(landlordRoleId, DEFAULT_ROLE_PERMISSIONS.landlord);

  console.log('RBAC permissions, overrides, and audit tables are ready.');
}

main()
  .catch((error) => {
    console.error('Failed to migrate RBAC.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

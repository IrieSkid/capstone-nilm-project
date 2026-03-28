import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';

import { pool } from '../../config/db';
import { AppModuleKey, RoleName } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { ALL_APP_MODULE_KEYS, getSupportedModulesForRole } from '../../shared/utils/rbac';

type UserOverrideState = 'inherit' | 'allow' | 'deny';
type BinaryAccessState = 'enabled' | 'disabled';

interface RoleRow extends RowDataPacket {
  role_id: number;
  role_name: RoleName;
}

interface UserRow extends RowDataPacket {
  user_id: number;
  user_name: string;
  user_email: string;
  role_id: number;
  role_name: RoleName;
  status_name: string;
}

interface ModuleRow extends RowDataPacket {
  module_id: number;
  module_key: AppModuleKey;
  module_name: string;
  module_description: string | null;
}

interface RolePermissionRow extends RowDataPacket {
  module_key: AppModuleKey;
}

interface RolePermissionMatrixRow extends RowDataPacket {
  role_id: number;
  role_name: RoleName;
  module_id: number;
  module_key: AppModuleKey;
  module_name: string;
  module_description: string | null;
  can_access: number;
}

interface UserPermissionMatrixRow extends RowDataPacket {
  user_id: number;
  user_name: string;
  user_email: string;
  role_id: number;
  role_name: RoleName;
  status_name: string;
  module_id: number;
  module_key: AppModuleKey;
  module_name: string;
  module_description: string | null;
  role_can_access: number;
  user_override_access: number | null;
}

interface AuditLogRow extends RowDataPacket {
  audit_log_id: number;
  changed_by_user_id: number;
  changed_by_name: string;
  target_scope: 'role' | 'user';
  target_role_id: number | null;
  target_role_name: RoleName | null;
  target_user_id: number | null;
  target_user_name: string | null;
  target_user_email: string | null;
  module_key: AppModuleKey;
  module_name: string;
  previous_state: string;
  next_state: string;
  created_at: string;
}

const ROLE_ORDER: RoleName[] = ['admin', 'tenant', 'landlord'];

function getRoleOrderIndex(roleName: RoleName) {
  const index = ROLE_ORDER.indexOf(roleName);

  return index === -1 ? ROLE_ORDER.length : index;
}

function getSupportedModuleIndex(roleName: RoleName, moduleKey: AppModuleKey) {
  return getSupportedModulesForRole(roleName).indexOf(moduleKey);
}

function mapUserOverrideState(canAccess: number | null): UserOverrideState {
  if (canAccess === null || canAccess === undefined) {
    return 'inherit';
  }

  return canAccess ? 'allow' : 'deny';
}

function mapBinaryAccessState(canAccess: boolean): BinaryAccessState {
  return canAccess ? 'enabled' : 'disabled';
}

function buildEffectivePermissionSet(input: {
  supportedPermissions: AppModuleKey[];
  roleEnabledPermissions: Set<AppModuleKey>;
  userOverrides?: Map<AppModuleKey, boolean>;
}) {
  const effectivePermissions = new Set<AppModuleKey>();

  for (const permissionKey of input.supportedPermissions) {
    const overrideValue = input.userOverrides?.get(permissionKey);
    const hasAccess =
      overrideValue !== undefined ? overrideValue : input.roleEnabledPermissions.has(permissionKey);

    if (hasAccess) {
      effectivePermissions.add(permissionKey);
    }
  }

  if (!effectivePermissions.has('dashboard.view')) {
    effectivePermissions.delete('port_control.use');
  }

  if (!effectivePermissions.has('landlord.rooms.view')) {
    effectivePermissions.delete('landlord.rooms.create');
    effectivePermissions.delete('landlord.rooms.update');
    effectivePermissions.delete('landlord.tenants.assign');
    effectivePermissions.delete('landlord.devices.assign');
  }

  if (!effectivePermissions.has('landlord.tenant_requests.view')) {
    effectivePermissions.delete('landlord.tenant_requests.approve');
  }

  if (!effectivePermissions.has('landlord.billing.view')) {
    effectivePermissions.delete('landlord.billing.manage');
  }

  return effectivePermissions;
}

function getAccessibleScreenModuleKeys(roleName: RoleName): AppModuleKey[] {
  switch (roleName) {
    case 'tenant':
      return ['dashboard.view', 'tenant.billing.view', 'profile.manage'];
    case 'landlord':
      return [
        'landlord.dashboard.view',
        'landlord.rooms.view',
        'landlord.tenants.view',
        'landlord.tenant_requests.view',
        'landlord.devices.view',
        'landlord.billing.view',
        'profile.manage',
      ];
    case 'admin':
    default:
      return ALL_APP_MODULE_KEYS;
  }
}

function ensureRoleHasAccessibleScreen(roleName: RoleName, effectivePermissions: Set<AppModuleKey>) {
  const accessibleScreens = getAccessibleScreenModuleKeys(roleName);

  if (!accessibleScreens.some((moduleKey) => effectivePermissions.has(moduleKey))) {
    throw new AppError(400, 'At least one accessible screen must remain enabled for this role.');
  }
}

async function getRoleById(roleId: number) {
  const [rows] = await pool.query<RoleRow[]>(
    `
      SELECT role_id, role_name
      FROM tblroles
      WHERE role_id = ?
      LIMIT 1
    `,
    [roleId],
  );

  return rows[0] ?? null;
}

async function getUserById(userId: number) {
  const [rows] = await pool.query<UserRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        r.role_id,
        r.role_name,
        s.status_name
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

async function getModuleByKey(moduleKey: AppModuleKey) {
  const [rows] = await pool.query<ModuleRow[]>(
    `
      SELECT module_id, module_key, module_name, module_description
      FROM tblapp_modules
      WHERE module_key = ?
      LIMIT 1
    `,
    [moduleKey],
  );

  return rows[0] ?? null;
}

async function getEnabledModuleKeysForRole(roleId: number) {
  const [rows] = await pool.query<RolePermissionRow[]>(
    `
      SELECT m.module_key
      FROM tblrole_module_permissions p
      INNER JOIN tblapp_modules m
        ON m.module_id = p.role_permission_module_id
      WHERE p.role_permission_role_id = ? AND p.can_access = 1
    `,
    [roleId],
  );

  return new Set<AppModuleKey>(rows.map((row) => row.module_key));
}

async function getUserOverrideMap(userId: number) {
  const [rows] = await pool.query<Array<RowDataPacket & { module_key: AppModuleKey; can_access: number }>>(
    `
      SELECT m.module_key, up.can_access
      FROM tbluser_module_permissions up
      INNER JOIN tblapp_modules m
        ON m.module_id = up.user_permission_module_id
      WHERE up.user_permission_user_id = ?
    `,
    [userId],
  );

  return new Map<AppModuleKey, boolean>(
    rows.map((row) => [row.module_key, Boolean(row.can_access)]),
  );
}

async function insertAuditLog(
  connection: PoolConnection,
  input: {
    changedByUserId: number;
    targetScope: 'role' | 'user';
    targetRoleId?: number | null;
    targetUserId?: number | null;
    moduleId: number;
    previousState: string;
    nextState: string;
  },
) {
  await connection.query(
    `
      INSERT INTO tblrbac_audit_logs (
        changed_by_user_id,
        target_scope,
        target_role_id,
        target_user_id,
        target_module_id,
        previous_state,
        next_state
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.changedByUserId,
      input.targetScope,
      input.targetRoleId ?? null,
      input.targetUserId ?? null,
      input.moduleId,
      input.previousState,
      input.nextState,
    ],
  );
}

export async function getRolePermissionMatrix() {
  const [rows] = await pool.query<RolePermissionMatrixRow[]>(
    `
      SELECT
        r.role_id,
        r.role_name,
        m.module_id,
        m.module_key,
        m.module_name,
        m.module_description,
        COALESCE(p.can_access, 0) AS can_access
      FROM tblroles r
      CROSS JOIN tblapp_modules m
      LEFT JOIN tblrole_module_permissions p
        ON p.role_permission_role_id = r.role_id
       AND p.role_permission_module_id = m.module_id
      ORDER BY r.role_id, m.module_id
    `,
  );

  const roleMap = new Map<
    number,
    {
      roleId: number;
      roleName: RoleName;
      isEditable: boolean;
      modules: Array<{
        moduleId: number;
        moduleKey: AppModuleKey;
        moduleName: string;
        moduleDescription: string | null;
        canAccess: boolean;
        locked: boolean;
      }>;
    }
  >();

  for (const row of rows) {
    const supportedPermissions = getSupportedModulesForRole(row.role_name);

    if (!supportedPermissions.includes(row.module_key)) {
      continue;
    }

    if (!roleMap.has(row.role_id)) {
      roleMap.set(row.role_id, {
        roleId: row.role_id,
        roleName: row.role_name,
        isEditable: row.role_name !== 'admin',
        modules: [],
      });
    }

    roleMap.get(row.role_id)!.modules.push({
      moduleId: row.module_id,
      moduleKey: row.module_key,
      moduleName: row.module_name,
      moduleDescription: row.module_description,
      canAccess: row.role_name === 'admin' ? true : Boolean(row.can_access),
      locked: row.role_name === 'admin',
    });
  }

  return [...roleMap.values()]
    .sort((left, right) => getRoleOrderIndex(left.roleName) - getRoleOrderIndex(right.roleName))
    .map((role) => ({
      ...role,
      modules: role.modules.sort(
        (left, right) =>
          getSupportedModuleIndex(role.roleName, left.moduleKey)
          - getSupportedModuleIndex(role.roleName, right.moduleKey),
      ),
    }));
}

export async function getUserPermissionMatrix() {
  const [rows] = await pool.query<UserPermissionMatrixRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        r.role_id,
        r.role_name,
        s.status_name,
        m.module_id,
        m.module_key,
        m.module_name,
        m.module_description,
        COALESCE(rp.can_access, 0) AS role_can_access,
        up.can_access AS user_override_access
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      CROSS JOIN tblapp_modules m
      LEFT JOIN tblrole_module_permissions rp
        ON rp.role_permission_role_id = r.role_id
       AND rp.role_permission_module_id = m.module_id
      LEFT JOIN tbluser_module_permissions up
        ON up.user_permission_user_id = u.user_id
       AND up.user_permission_module_id = m.module_id
      ORDER BY u.user_name, m.module_id
    `,
  );

  const userMap = new Map<
    number,
    {
      userId: number;
      userName: string;
      userEmail: string;
      roleId: number;
      roleName: RoleName;
      statusName: string;
      isEditable: boolean;
      modules: Array<{
        moduleId: number;
        moduleKey: AppModuleKey;
        moduleName: string;
        moduleDescription: string | null;
        roleCanAccess: boolean;
        overrideState: UserOverrideState;
        effectiveCanAccess: boolean;
        locked: boolean;
      }>;
    }
  >();

  for (const row of rows) {
    const supportedPermissions = getSupportedModulesForRole(row.role_name);

    if (!supportedPermissions.includes(row.module_key)) {
      continue;
    }

    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, {
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        roleId: row.role_id,
        roleName: row.role_name,
        statusName: row.status_name,
        isEditable: row.role_name !== 'admin',
        modules: [],
      });
    }

    userMap.get(row.user_id)!.modules.push({
      moduleId: row.module_id,
      moduleKey: row.module_key,
      moduleName: row.module_name,
      moduleDescription: row.module_description,
      roleCanAccess: row.role_name === 'admin' ? true : Boolean(row.role_can_access),
      overrideState: row.role_name === 'admin' ? 'inherit' : mapUserOverrideState(row.user_override_access),
      effectiveCanAccess: false,
      locked: row.role_name === 'admin',
    });
  }

  return [...userMap.values()]
    .sort((left, right) => left.userName.localeCompare(right.userName))
    .map((user) => {
      const supportedPermissions = getSupportedModulesForRole(user.roleName);
      const roleEnabledPermissions = new Set<AppModuleKey>(
        user.modules.filter((module) => module.roleCanAccess).map((module) => module.moduleKey),
      );
      const userOverrides = new Map<AppModuleKey, boolean>(
        user.modules
          .filter((module) => module.overrideState !== 'inherit')
          .map((module) => [module.moduleKey, module.overrideState === 'allow']),
      );
      const effectivePermissions = user.roleName === 'admin'
        ? new Set(supportedPermissions)
        : buildEffectivePermissionSet({
            supportedPermissions,
            roleEnabledPermissions,
            userOverrides,
          });

      return {
        ...user,
        modules: user.modules
          .sort(
            (left, right) =>
              getSupportedModuleIndex(user.roleName, left.moduleKey)
              - getSupportedModuleIndex(user.roleName, right.moduleKey),
          )
          .map((module) => ({
            ...module,
            effectiveCanAccess: effectivePermissions.has(module.moduleKey),
          })),
      };
    });
}

export async function getRbacAuditLogs(limit = 20) {
  const [rows] = await pool.query<AuditLogRow[]>(
    `
      SELECT
        l.audit_log_id,
        l.changed_by_user_id,
        changer.user_name AS changed_by_name,
        l.target_scope,
        l.target_role_id,
        target_role.role_name AS target_role_name,
        l.target_user_id,
        target_user.user_name AS target_user_name,
        target_user.user_email AS target_user_email,
        m.module_key,
        m.module_name,
        l.previous_state,
        l.next_state,
        l.created_at
      FROM tblrbac_audit_logs l
      INNER JOIN tblusers changer
        ON changer.user_id = l.changed_by_user_id
      INNER JOIN tblapp_modules m
        ON m.module_id = l.target_module_id
      LEFT JOIN tblroles target_role
        ON target_role.role_id = l.target_role_id
      LEFT JOIN tblusers target_user
        ON target_user.user_id = l.target_user_id
      ORDER BY l.created_at DESC, l.audit_log_id DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    auditLogId: row.audit_log_id,
    changedByUserId: row.changed_by_user_id,
    changedByName: row.changed_by_name,
    targetScope: row.target_scope,
    targetRoleId: row.target_role_id,
    targetRoleName: row.target_role_name,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user_name,
    targetUserEmail: row.target_user_email,
    moduleKey: row.module_key,
    moduleName: row.module_name,
    previousState: row.previous_state,
    nextState: row.next_state,
    createdAt: row.created_at,
  }));
}

export async function getAccessControlMatrix() {
  const [roles, users, auditLogs] = await Promise.all([
    getRolePermissionMatrix(),
    getUserPermissionMatrix(),
    getRbacAuditLogs(),
  ]);

  return {
    roles,
    users,
    auditLogs,
  };
}

export async function updateRoleModulePermission(input: {
  roleId: number;
  moduleKey: AppModuleKey;
  canAccess: boolean;
  changedByUserId: number;
}) {
  const role = await getRoleById(input.roleId);

  if (!role) {
    throw new AppError(404, 'Role not found.');
  }

  if (role.role_name === 'admin') {
    throw new AppError(400, 'Admin access is fixed and cannot be changed from this module.');
  }

  const supportedPermissions = getSupportedModulesForRole(role.role_name);

  if (!supportedPermissions.includes(input.moduleKey)) {
    throw new AppError(400, 'This permission is not supported for the selected role.');
  }

  const module = await getModuleByKey(input.moduleKey);

  if (!module) {
    throw new AppError(404, 'Permission not found.');
  }

  const enabledPermissions = await getEnabledModuleKeysForRole(role.role_id);
  const previousState = mapBinaryAccessState(enabledPermissions.has(input.moduleKey));
  const nextEnabledPermissions = new Set(enabledPermissions);

  if (input.canAccess) {
    nextEnabledPermissions.add(input.moduleKey);
  } else {
    nextEnabledPermissions.delete(input.moduleKey);
  }

  if (input.moduleKey === 'port_control.use' && input.canAccess && !nextEnabledPermissions.has('dashboard.view')) {
    throw new AppError(400, 'Enable dashboard.view before turning on port_control.use.');
  }

  if (
    ['landlord.rooms.create', 'landlord.rooms.update', 'landlord.tenants.assign', 'landlord.devices.assign'].includes(input.moduleKey)
    && input.canAccess
    && !nextEnabledPermissions.has('landlord.rooms.view')
  ) {
    throw new AppError(400, 'Enable landlord.rooms.view before turning on this landlord management permission.');
  }

  if (
    input.moduleKey === 'landlord.tenant_requests.approve'
    && input.canAccess
    && !nextEnabledPermissions.has('landlord.tenant_requests.view')
  ) {
    throw new AppError(400, 'Enable landlord.tenant_requests.view before turning on landlord.tenant_requests.approve.');
  }

  if (
    input.moduleKey === 'landlord.billing.manage'
    && input.canAccess
    && !nextEnabledPermissions.has('landlord.billing.view')
  ) {
    throw new AppError(400, 'Enable landlord.billing.view before turning on landlord.billing.manage.');
  }

  const portControlWasEnabled = nextEnabledPermissions.has('port_control.use');
  const landlordRoomManagementWasEnabled = {
    roomCreate: nextEnabledPermissions.has('landlord.rooms.create'),
    roomUpdate: nextEnabledPermissions.has('landlord.rooms.update'),
    tenantAssign: nextEnabledPermissions.has('landlord.tenants.assign'),
    deviceAssign: nextEnabledPermissions.has('landlord.devices.assign'),
  };
  const tenantRequestApprovalWasEnabled = nextEnabledPermissions.has('landlord.tenant_requests.approve');
  const landlordBillingManageWasEnabled = nextEnabledPermissions.has('landlord.billing.manage');

  if (input.moduleKey === 'dashboard.view' && !input.canAccess) {
    nextEnabledPermissions.delete('port_control.use');
  }

  if (input.moduleKey === 'landlord.rooms.view' && !input.canAccess) {
    nextEnabledPermissions.delete('landlord.rooms.create');
    nextEnabledPermissions.delete('landlord.rooms.update');
    nextEnabledPermissions.delete('landlord.tenants.assign');
    nextEnabledPermissions.delete('landlord.devices.assign');
  }

  if (input.moduleKey === 'landlord.tenant_requests.view' && !input.canAccess) {
    nextEnabledPermissions.delete('landlord.tenant_requests.approve');
  }

  if (input.moduleKey === 'landlord.billing.view' && !input.canAccess) {
    nextEnabledPermissions.delete('landlord.billing.manage');
  }

  ensureRoleHasAccessibleScreen(role.role_name, nextEnabledPermissions);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        INSERT INTO tblrole_module_permissions (
          role_permission_role_id,
          role_permission_module_id,
          can_access
        )
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
      `,
      [role.role_id, module.module_id, input.canAccess ? 1 : 0],
    );

    if (previousState !== mapBinaryAccessState(input.canAccess)) {
      await insertAuditLog(connection, {
        changedByUserId: input.changedByUserId,
        targetScope: 'role',
        targetRoleId: role.role_id,
        moduleId: module.module_id,
        previousState,
        nextState: mapBinaryAccessState(input.canAccess),
      });
    }

    if (input.moduleKey === 'dashboard.view' && !input.canAccess) {
      const portControlPermission = await getModuleByKey('port_control.use');

      if (portControlPermission) {
        await connection.query(
          `
            INSERT INTO tblrole_module_permissions (
              role_permission_role_id,
              role_permission_module_id,
              can_access
            )
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
          `,
          [role.role_id, portControlPermission.module_id],
        );

        if (portControlWasEnabled) {
          await insertAuditLog(connection, {
            changedByUserId: input.changedByUserId,
            targetScope: 'role',
            targetRoleId: role.role_id,
            moduleId: portControlPermission.module_id,
            previousState: 'enabled',
            nextState: 'disabled',
          });
        }
      }
    }

    if (input.moduleKey === 'landlord.rooms.view' && !input.canAccess) {
      const dependentPermissions: AppModuleKey[] = [
        'landlord.rooms.create',
        'landlord.rooms.update',
        'landlord.tenants.assign',
        'landlord.devices.assign',
      ];

      for (const [permissionKey, previousEnabled] of [
        ['landlord.rooms.create', landlordRoomManagementWasEnabled.roomCreate],
        ['landlord.rooms.update', landlordRoomManagementWasEnabled.roomUpdate],
        ['landlord.tenants.assign', landlordRoomManagementWasEnabled.tenantAssign],
        ['landlord.devices.assign', landlordRoomManagementWasEnabled.deviceAssign],
      ] as const) {
        const dependentPermission = await getModuleByKey(permissionKey);

        if (!dependentPermission) {
          continue;
        }

        await connection.query(
          `
            INSERT INTO tblrole_module_permissions (
              role_permission_role_id,
              role_permission_module_id,
              can_access
            )
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
          `,
          [role.role_id, dependentPermission.module_id],
        );

        if (previousEnabled) {
          await insertAuditLog(connection, {
            changedByUserId: input.changedByUserId,
            targetScope: 'role',
            targetRoleId: role.role_id,
            moduleId: dependentPermission.module_id,
            previousState: 'enabled',
            nextState: 'disabled',
          });
        }
      }
    }

    if (input.moduleKey === 'landlord.tenant_requests.view' && !input.canAccess) {
      const tenantRequestApprovePermission = await getModuleByKey('landlord.tenant_requests.approve');

      if (tenantRequestApprovePermission) {
        await connection.query(
          `
            INSERT INTO tblrole_module_permissions (
              role_permission_role_id,
              role_permission_module_id,
              can_access
            )
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
          `,
          [role.role_id, tenantRequestApprovePermission.module_id],
        );

        if (tenantRequestApprovalWasEnabled) {
          await insertAuditLog(connection, {
            changedByUserId: input.changedByUserId,
            targetScope: 'role',
            targetRoleId: role.role_id,
            moduleId: tenantRequestApprovePermission.module_id,
            previousState: 'enabled',
            nextState: 'disabled',
          });
        }
      }
    }

    if (input.moduleKey === 'landlord.billing.view' && !input.canAccess) {
      const landlordBillingManagePermission = await getModuleByKey('landlord.billing.manage');

      if (landlordBillingManagePermission) {
        await connection.query(
          `
            INSERT INTO tblrole_module_permissions (
              role_permission_role_id,
              role_permission_module_id,
              can_access
            )
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
          `,
          [role.role_id, landlordBillingManagePermission.module_id],
        );

        if (landlordBillingManageWasEnabled) {
          await insertAuditLog(connection, {
            changedByUserId: input.changedByUserId,
            targetScope: 'role',
            targetRoleId: role.role_id,
            moduleId: landlordBillingManagePermission.module_id,
            previousState: 'enabled',
            nextState: 'disabled',
          });
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getAccessControlMatrix();
}

export async function updateUserModulePermission(input: {
  userId: number;
  moduleKey: AppModuleKey;
  overrideState: UserOverrideState;
  changedByUserId: number;
}) {
  const user = await getUserById(input.userId);

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  if (user.role_name === 'admin') {
    throw new AppError(400, 'Admin access is fixed and cannot be overridden.');
  }

  const supportedPermissions = getSupportedModulesForRole(user.role_name);

  if (!supportedPermissions.includes(input.moduleKey)) {
    throw new AppError(400, 'This permission is not supported for the selected user role.');
  }

  const module = await getModuleByKey(input.moduleKey);

  if (!module) {
    throw new AppError(404, 'Permission not found.');
  }

  const roleEnabledPermissions = await getEnabledModuleKeysForRole(user.role_id);
  const userOverrides = await getUserOverrideMap(user.user_id);
  const previousOverrideState = userOverrides.has(input.moduleKey)
    ? userOverrides.get(input.moduleKey)
      ? 'allow'
      : 'deny'
    : 'inherit';
  const nextUserOverrides = new Map(userOverrides);

  if (input.overrideState === 'inherit') {
    nextUserOverrides.delete(input.moduleKey);
  } else {
    nextUserOverrides.set(input.moduleKey, input.overrideState === 'allow');
  }

  const effectivePermissions = buildEffectivePermissionSet({
    supportedPermissions,
    roleEnabledPermissions,
    userOverrides: nextUserOverrides,
  });

  if (input.moduleKey === 'port_control.use' && input.overrideState === 'allow' && !effectivePermissions.has('dashboard.view')) {
    throw new AppError(400, 'Enable dashboard.view for this user before setting port_control.use to allow.');
  }

  if (
    ['landlord.rooms.create', 'landlord.rooms.update', 'landlord.tenants.assign', 'landlord.devices.assign'].includes(input.moduleKey)
    && input.overrideState === 'allow'
    && !effectivePermissions.has('landlord.rooms.view')
  ) {
    throw new AppError(400, 'Enable landlord.rooms.view for this user before allowing landlord management actions.');
  }

  if (
    input.moduleKey === 'landlord.tenant_requests.approve'
    && input.overrideState === 'allow'
    && !effectivePermissions.has('landlord.tenant_requests.view')
  ) {
    throw new AppError(400, 'Enable landlord.tenant_requests.view for this user before allowing tenant approval actions.');
  }

  if (
    input.moduleKey === 'landlord.billing.manage'
    && input.overrideState === 'allow'
    && !effectivePermissions.has('landlord.billing.view')
  ) {
    throw new AppError(400, 'Enable landlord.billing.view for this user before allowing billing management actions.');
  }

  ensureRoleHasAccessibleScreen(user.role_name, effectivePermissions);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (input.overrideState === 'inherit') {
      await connection.query(
        `
          DELETE FROM tbluser_module_permissions
          WHERE user_permission_user_id = ? AND user_permission_module_id = ?
        `,
        [user.user_id, module.module_id],
      );
    } else {
      await connection.query(
        `
          INSERT INTO tbluser_module_permissions (
            user_permission_user_id,
            user_permission_module_id,
            can_access
          )
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)
        `,
        [user.user_id, module.module_id, input.overrideState === 'allow' ? 1 : 0],
      );
    }

    if (previousOverrideState !== input.overrideState) {
      await insertAuditLog(connection, {
        changedByUserId: input.changedByUserId,
        targetScope: 'user',
        targetUserId: user.user_id,
        moduleId: module.module_id,
        previousState: previousOverrideState,
        nextState: input.overrideState,
      });
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getAccessControlMatrix();
}

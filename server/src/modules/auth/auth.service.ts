import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AppModuleKey, AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { normalizeLandlordRegistrationCode } from '../../shared/utils/landlord-code';
import { comparePassword, hashPassword } from '../../shared/utils/password';
import {
  normalizePhilippinePhone,
  toComparablePhilippinePhone,
} from '../../shared/utils/philippine-phone';
import {
  ALL_APP_MODULE_KEYS,
  getSupportedModulesForRole,
  isAppModuleKey,
} from '../../shared/utils/rbac';

interface UserRow extends RowDataPacket {
  user_id: number;
  user_name: string;
  user_email: string;
  user_password: string;
  user_phone: string | null;
  created_at: string;
  role_id: number;
  role_name: AuthenticatedUser['roleName'];
  status_id: number;
  status_name: string;
  user_landlord_id: number | null;
  landlord_owner_name: string | null;
  landlord_owner_email: string | null;
  landlord_owner_phone: string | null;
  landlord_registration_code: string | null;
}

interface EffectivePermissionRow extends RowDataPacket {
  module_key: string;
  can_access: number;
}

interface AdminSupportRow extends RowDataPacket {
  user_name: string;
  user_email: string;
  user_phone: string | null;
}

async function getEffectivePermissionsForUser(row: UserRow): Promise<AppModuleKey[]> {
  const supportedModules = getSupportedModulesForRole(row.role_name);

  if (row.role_name === 'admin') {
    return ALL_APP_MODULE_KEYS;
  }

  if (supportedModules.length === 0) {
    return [];
  }

  const [rows] = await pool.query<EffectivePermissionRow[]>(
    `
      SELECT
        m.module_key,
        CASE
          WHEN up.can_access IS NOT NULL THEN up.can_access
          WHEN rp.can_access IS NOT NULL THEN rp.can_access
          ELSE 0
        END AS can_access
      FROM tblapp_modules m
      LEFT JOIN tblrole_module_permissions rp
        ON rp.role_permission_module_id = m.module_id
       AND rp.role_permission_role_id = ?
      LEFT JOIN tbluser_module_permissions up
        ON up.user_permission_module_id = m.module_id
       AND up.user_permission_user_id = ?
      ORDER BY m.module_id
    `,
    [row.role_id, row.user_id],
  );

  const grantedModules = rows
    .filter(
      (permissionRow) =>
        isAppModuleKey(permissionRow.module_key)
        && supportedModules.includes(permissionRow.module_key)
        && Boolean(permissionRow.can_access),
    )
    .map((permissionRow) => permissionRow.module_key as AppModuleKey);

  if (!grantedModules.includes('dashboard.view')) {
    return grantedModules.filter((moduleKey) => moduleKey !== 'port_control.use');
  }

  return grantedModules;
}

async function findPrimaryAdminSupport(): Promise<AdminSupportRow | null> {
  const [rows] = await pool.query<AdminSupportRow[]>(
    `
      SELECT
        u.user_name,
        u.user_email,
        u.user_phone
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      WHERE r.role_name = 'admin'
        AND s.status_name = 'active'
      ORDER BY u.user_id
      LIMIT 1
    `,
  );

  return rows[0] ?? null;
}

async function buildAuthenticatedUser(row: UserRow): Promise<AuthenticatedUser> {
  const permissions = await getEffectivePermissionsForUser(row);
  const adminSupport = row.role_name === 'landlord'
    ? await findPrimaryAdminSupport()
    : null;

  return {
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    roleId: row.role_id,
    roleName: row.role_name,
    statusId: row.status_id,
    statusName: row.status_name,
    userPhone: row.user_phone,
    landlordOwnerId: row.user_landlord_id,
    landlordOwnerName: row.landlord_owner_name,
    landlordOwnerEmail: row.landlord_owner_email,
    landlordOwnerPhone: row.landlord_owner_phone,
    adminSupportName: adminSupport?.user_name ?? null,
    adminSupportEmail: adminSupport?.user_email ?? null,
    adminSupportPhone: adminSupport?.user_phone ?? null,
    landlordRegistrationCode: row.landlord_registration_code,
    createdAt: row.created_at,
    permissions,
  };
}

async function resolveRoleId(roleName: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT role_id AS id
      FROM tblroles
      WHERE role_name = ?
      LIMIT 1
    `,
    [roleName],
  );

  if (!rows[0]?.id) {
    throw new AppError(400, 'Invalid role.');
  }

  return Number(rows[0].id);
}

async function resolveStatusId(statusName: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT status_id AS id
      FROM tbluser_status
      WHERE status_name = ?
      LIMIT 1
    `,
    [statusName],
  );

  if (!rows[0]?.id) {
    throw new AppError(400, 'Invalid user status.');
  }

  return Number(rows[0].id);
}

async function findLandlordByRegistrationCode(registrationCode: string) {
  const [rows] = await pool.query<UserRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_password,
        u.user_phone,
        u.created_at,
        u.user_landlord_id,
        owner.user_name AS landlord_owner_name,
        owner.user_email AS landlord_owner_email,
        owner.user_phone AS landlord_owner_phone,
        u.landlord_registration_code,
        r.role_id,
        r.role_name,
        s.status_id,
        s.status_name
      FROM tblusers u
      LEFT JOIN tblusers owner ON owner.user_id = u.user_landlord_id
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      WHERE r.role_name = 'landlord'
        AND u.landlord_registration_code = ?
      LIMIT 1
    `,
    [normalizeLandlordRegistrationCode(registrationCode)],
  );

  return rows[0] ?? null;
}

export async function findUserWithPasswordByEmail(email: string) {
  const [rows] = await pool.query<UserRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_password,
        u.user_phone,
        u.created_at,
        u.user_landlord_id,
        owner.user_name AS landlord_owner_name,
        owner.user_email AS landlord_owner_email,
        owner.user_phone AS landlord_owner_phone,
        u.landlord_registration_code,
        r.role_id,
        r.role_name,
        s.status_id,
        s.status_name
      FROM tblusers u
      LEFT JOIN tblusers owner ON owner.user_id = u.user_landlord_id
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      WHERE u.user_email = ?
      LIMIT 1
    `,
    [email],
  );

  return rows[0] ?? null;
}

export async function findAuthenticatedUserById(userId: number): Promise<AuthenticatedUser | null> {
  const [rows] = await pool.query<UserRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_password,
        u.user_phone,
        u.created_at,
        u.user_landlord_id,
        owner.user_name AS landlord_owner_name,
        owner.user_email AS landlord_owner_email,
        owner.user_phone AS landlord_owner_phone,
        u.landlord_registration_code,
        r.role_id,
        r.role_name,
        s.status_id,
        s.status_name
      FROM tblusers u
      LEFT JOIN tblusers owner ON owner.user_id = u.user_landlord_id
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  if (!rows[0]) {
    return null;
  }

  return buildAuthenticatedUser(rows[0]);
}

async function findUserWithPasswordById(userId: number) {
  const [rows] = await pool.query<UserRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_password,
        u.user_phone,
        u.created_at,
        u.user_landlord_id,
        owner.user_name AS landlord_owner_name,
        owner.user_email AS landlord_owner_email,
        owner.user_phone AS landlord_owner_phone,
        u.landlord_registration_code,
        r.role_id,
        r.role_name,
        s.status_id,
        s.status_name
      FROM tblusers u
      LEFT JOIN tblusers owner ON owner.user_id = u.user_landlord_id
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

export async function authenticateUser(email: string, password: string) {
  const userRow = await findUserWithPasswordByEmail(email);

  if (!userRow) {
    throw new AppError(401, 'Invalid email or password.');
  }

  if (userRow.status_name === 'pending_approval') {
    throw new AppError(403, 'Your registration is waiting for landlord approval.');
  }

  if (userRow.status_name === 'rejected') {
    throw new AppError(403, 'Your registration request was denied. Please contact your landlord or the admin.');
  }

  if (userRow.status_name !== 'active') {
    throw new AppError(403, 'Only active users can log in.');
  }

  const passwordMatches = await comparePassword(password, userRow.user_password);

  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password.');
  }

  return buildAuthenticatedUser(userRow);
}

export async function registerTenant(input: {
  user_name: string;
  user_email: string;
  user_phone: string;
  landlord_registration_code: string;
  user_password: string;
}) {
  const roleId = await resolveRoleId('tenant');
  const statusId = await resolveStatusId('pending_approval');
  const passwordHash = await hashPassword(input.user_password);
  const landlord = await findLandlordByRegistrationCode(input.landlord_registration_code);

  if (!landlord || landlord.role_name !== 'landlord' || landlord.status_name !== 'active') {
    throw new AppError(400, 'The landlord invite code is invalid or no longer active.');
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO tblusers (
          user_role_id,
          user_status_id,
          user_landlord_id,
          user_name,
          user_email,
          user_password,
          user_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        roleId,
        statusId,
        landlord.user_id,
        input.user_name,
        input.user_email,
        passwordHash,
        normalizePhilippinePhone(input.user_phone),
      ],
    );

    const createdUser = await findAuthenticatedUserById(result.insertId);

    if (!createdUser) {
      throw new AppError(404, 'User not found.');
    }

    return createdUser;
  } catch (error) {
    handleDatabaseError(error, 'Email address already exists.');
  }
}

export async function resetPasswordWithRecovery(input: {
  user_email: string;
  user_phone: string;
  new_password: string;
}) {
  const userRow = await findUserWithPasswordByEmail(input.user_email);

  if (!userRow || userRow.status_name !== 'active') {
    throw new AppError(404, 'No active account matched the provided recovery details.');
  }

  if (
    !userRow.user_phone
    || toComparablePhilippinePhone(userRow.user_phone) !== toComparablePhilippinePhone(input.user_phone)
  ) {
    throw new AppError(400, 'Email and phone number did not match an active account.');
  }

  const passwordHash = await hashPassword(input.new_password);

  await pool.query(
    `
      UPDATE tblusers
      SET user_password = ?
      WHERE user_id = ?
    `,
    [passwordHash, userRow.user_id],
  );

  const updatedUser = await findAuthenticatedUserById(userRow.user_id);

  if (!updatedUser) {
    throw new AppError(404, 'User not found.');
  }

  return updatedUser;
}

export async function updateAuthenticatedUserProfile(
  userId: number,
  input: {
    user_name: string;
    user_email: string;
    user_phone?: string;
  },
) {
  const userRow = await findUserWithPasswordById(userId);

  if (!userRow) {
    throw new AppError(404, 'User not found.');
  }

  try {
    await pool.query(
      `
        UPDATE tblusers
        SET
          user_name = ?,
          user_email = ?,
          user_phone = ?
        WHERE user_id = ?
      `,
      [
        input.user_name,
        input.user_email,
        input.user_phone?.trim() ? normalizePhilippinePhone(input.user_phone) : null,
        userId,
      ],
    );
  } catch (error) {
    handleDatabaseError(error, 'Email address already exists.');
  }

  const updatedUser = await findAuthenticatedUserById(userId);

  if (!updatedUser) {
    throw new AppError(404, 'User not found.');
  }

  return updatedUser;
}

export async function changeAuthenticatedUserPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
) {
  const userRow = await findUserWithPasswordById(userId);

  if (!userRow) {
    throw new AppError(404, 'User not found.');
  }

  const passwordMatches = await comparePassword(currentPassword, userRow.user_password);

  if (!passwordMatches) {
    throw new AppError(400, 'Current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);

  await pool.query(
    `
      UPDATE tblusers
      SET user_password = ?
      WHERE user_id = ?
    `,
    [passwordHash, userId],
  );

  const updatedUser = await findAuthenticatedUserById(userId);

  if (!updatedUser) {
    throw new AppError(404, 'User not found.');
  }

  return updatedUser;
}

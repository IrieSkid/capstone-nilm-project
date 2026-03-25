import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { comparePassword, hashPassword } from '../../shared/utils/password';

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
}

function mapUser(row: UserRow): AuthenticatedUser {
  return {
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    roleId: row.role_id,
    roleName: row.role_name,
    statusId: row.status_id,
    statusName: row.status_name,
    userPhone: row.user_phone,
    createdAt: row.created_at,
  };
}

function normalizePhone(phone: string | null | undefined) {
  return String(phone ?? '').replace(/\D/g, '');
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
        r.role_id,
        r.role_name,
        s.status_id,
        s.status_name
      FROM tblusers u
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
        r.role_id,
        r.role_name,
        s.status_id,
        s.status_name
      FROM tblusers u
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

  return mapUser(rows[0]);
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
        r.role_id,
        r.role_name,
        s.status_id,
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

export async function authenticateUser(email: string, password: string) {
  const userRow = await findUserWithPasswordByEmail(email);

  if (!userRow) {
    throw new AppError(401, 'Invalid email or password.');
  }

  if (userRow.status_name !== 'active') {
    throw new AppError(403, 'Only active users can log in.');
  }

  const passwordMatches = await comparePassword(password, userRow.user_password);

  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password.');
  }

  return mapUser(userRow);
}

export async function registerTenant(input: {
  user_name: string;
  user_email: string;
  user_phone: string;
  user_password: string;
}) {
  const roleId = await resolveRoleId('tenant');
  const statusId = await resolveStatusId('active');
  const passwordHash = await hashPassword(input.user_password);

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO tblusers (
          user_role_id,
          user_status_id,
          user_name,
          user_email,
          user_password,
          user_phone
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        roleId,
        statusId,
        input.user_name,
        input.user_email,
        passwordHash,
        input.user_phone.trim(),
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

  if (!userRow.user_phone || normalizePhone(userRow.user_phone) !== normalizePhone(input.user_phone)) {
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
        input.user_phone?.trim() ? input.user_phone.trim() : null,
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

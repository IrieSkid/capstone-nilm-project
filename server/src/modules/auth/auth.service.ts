import { RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AuthenticatedUser } from '../../shared/types/auth';
import { AppError } from '../../shared/utils/app-error';
import { comparePassword } from '../../shared/utils/password';

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

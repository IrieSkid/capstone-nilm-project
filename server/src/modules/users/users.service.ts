import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { hashPassword } from '../../shared/utils/password';

interface LookupRow extends RowDataPacket {
  id: number;
}

interface UserListRow extends RowDataPacket {
  user_id: number;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  created_at: string;
  role_name: string;
  status_name: string;
  assigned_rooms: string | null;
}

interface OptionRow extends RowDataPacket {
  role_name?: string;
  status_name?: string;
}

function mapUserRow(row: UserListRow) {
  return {
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    userPhone: row.user_phone,
    createdAt: row.created_at,
    roleName: row.role_name,
    statusName: row.status_name,
    assignedRooms: row.assigned_rooms ? row.assigned_rooms.split(', ') : [],
  };
}

export async function listUsers() {
  const [rows] = await pool.query<UserListRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_phone,
        u.created_at,
        r.role_name,
        s.status_name,
        GROUP_CONCAT(room.room_name ORDER BY room.room_name SEPARATOR ', ') AS assigned_rooms
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      LEFT JOIN tblrooms room ON room.room_tenant_id = u.user_id
      GROUP BY
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_phone,
        u.created_at,
        r.role_name,
        s.status_name
      ORDER BY u.user_id
    `,
  );

  const [roleRows] = await pool.query<OptionRow[]>(
    `
      SELECT role_name
      FROM tblroles
      ORDER BY role_id
    `,
  );

  const [statusRows] = await pool.query<OptionRow[]>(
    `
      SELECT status_name
      FROM tbluser_status
      ORDER BY status_id
    `,
  );

  return {
    users: rows.map(mapUserRow),
    roles: roleRows.map((row) => row.role_name),
    statuses: statusRows.map((row) => row.status_name),
  };
}

async function resolveRoleId(roleName: string) {
  const [rows] = await pool.query<LookupRow[]>(
    `
      SELECT role_id AS id
      FROM tblroles
      WHERE role_name = ?
      LIMIT 1
    `,
    [roleName],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Invalid role.');
  }

  return rows[0].id;
}

async function resolveStatusId(statusName: string) {
  const [rows] = await pool.query<LookupRow[]>(
    `
      SELECT status_id AS id
      FROM tbluser_status
      WHERE status_name = ?
      LIMIT 1
    `,
    [statusName],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Invalid user status.');
  }

  return rows[0].id;
}

async function getUserById(userId: number) {
  const [rows] = await pool.query<UserListRow[]>(
    `
      SELECT
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_phone,
        u.created_at,
        r.role_name,
        s.status_name,
        GROUP_CONCAT(room.room_name ORDER BY room.room_name SEPARATOR ', ') AS assigned_rooms
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      LEFT JOIN tblrooms room ON room.room_tenant_id = u.user_id
      WHERE u.user_id = ?
      GROUP BY
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_phone,
        u.created_at,
        r.role_name,
        s.status_name
      LIMIT 1
    `,
    [userId],
  );

  if (!rows[0]) {
    throw new AppError(404, 'User not found.');
  }

  return mapUserRow(rows[0]);
}

export async function createUser(input: {
  user_name: string;
  user_email: string;
  user_password: string;
  user_phone?: string;
  role_name: string;
  status_name: string;
}) {
  try {
    const roleId = await resolveRoleId(input.role_name);
    const statusId = await resolveStatusId(input.status_name);
    const passwordHash = await hashPassword(input.user_password);

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
        input.user_phone || null,
      ],
    );

    return getUserById(result.insertId);
  } catch (error) {
    handleDatabaseError(error, 'Email address already exists.');
  }
}

export async function updateUser(
  userId: number,
  input: Partial<{
    user_name: string;
    user_email: string;
    user_password: string;
    user_phone: string;
    role_name: string;
    status_name: string;
  }>,
) {
  await getUserById(userId);

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.user_name !== undefined) {
    fields.push('user_name = ?');
    values.push(input.user_name);
  }

  if (input.user_email !== undefined) {
    fields.push('user_email = ?');
    values.push(input.user_email);
  }

  if (input.user_phone !== undefined) {
    fields.push('user_phone = ?');
    values.push(input.user_phone || null);
  }

  if (input.user_password !== undefined) {
    fields.push('user_password = ?');
    values.push(await hashPassword(input.user_password));
  }

  if (input.role_name !== undefined) {
    fields.push('user_role_id = ?');
    values.push(await resolveRoleId(input.role_name));
  }

  if (input.status_name !== undefined) {
    fields.push('user_status_id = ?');
    values.push(await resolveStatusId(input.status_name));
  }

  try {
    await pool.query(
      `
        UPDATE tblusers
        SET ${fields.join(', ')}
        WHERE user_id = ?
      `,
      [...values, userId],
    );
  } catch (error) {
    handleDatabaseError(error, 'Email address already exists.');
  }

  return getUserById(userId);
}

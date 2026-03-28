import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AppError } from '../../shared/utils/app-error';
import { handleDatabaseError } from '../../shared/utils/database-error';
import { generateUniqueLandlordRegistrationCode } from '../../shared/utils/landlord-code';
import { hashPassword } from '../../shared/utils/password';
import { normalizePhilippinePhone } from '../../shared/utils/philippine-phone';

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
  landlord_registration_code: string | null;
  landlord_owner_id: number | null;
  landlord_owner_name: string | null;
  landlord_owner_email: string | null;
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
    landlordRegistrationCode: row.landlord_registration_code,
    landlordOwnerId: row.landlord_owner_id,
    landlordOwnerName: row.landlord_owner_name,
    landlordOwnerEmail: row.landlord_owner_email,
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
        u.landlord_registration_code,
        owner.user_id AS landlord_owner_id,
        owner.user_name AS landlord_owner_name,
        owner.user_email AS landlord_owner_email,
        GROUP_CONCAT(room.room_name ORDER BY room.room_name SEPARATOR ', ') AS assigned_rooms
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      LEFT JOIN tblusers owner ON owner.user_id = u.user_landlord_id
      LEFT JOIN tblrooms room
        ON (r.role_name = 'tenant' AND room.room_tenant_id = u.user_id)
        OR (r.role_name = 'landlord' AND room.room_landlord_id = u.user_id)
      GROUP BY
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_phone,
        u.created_at,
        r.role_name,
        s.status_name
        ,
        u.landlord_registration_code,
        owner.user_id,
        owner.user_name,
        owner.user_email
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

async function assertLandlordExists(landlordId: number) {
  const [rows] = await pool.query<LookupRow[]>(
    `
      SELECT u.user_id AS id
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      WHERE u.user_id = ? AND r.role_name = 'landlord'
      LIMIT 1
    `,
    [landlordId],
  );

  if (!rows[0]) {
    throw new AppError(400, 'Tenant accounts must reference a valid landlord owner.');
  }
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
        u.landlord_registration_code,
        owner.user_id AS landlord_owner_id,
        owner.user_name AS landlord_owner_name,
        owner.user_email AS landlord_owner_email,
        GROUP_CONCAT(room.room_name ORDER BY room.room_name SEPARATOR ', ') AS assigned_rooms
      FROM tblusers u
      INNER JOIN tblroles r ON r.role_id = u.user_role_id
      INNER JOIN tbluser_status s ON s.status_id = u.user_status_id
      LEFT JOIN tblusers owner ON owner.user_id = u.user_landlord_id
      LEFT JOIN tblrooms room
        ON (r.role_name = 'tenant' AND room.room_tenant_id = u.user_id)
        OR (r.role_name = 'landlord' AND room.room_landlord_id = u.user_id)
      WHERE u.user_id = ?
      GROUP BY
        u.user_id,
        u.user_name,
        u.user_email,
        u.user_phone,
        u.created_at,
        r.role_name,
        s.status_name
        ,
        u.landlord_registration_code,
        owner.user_id,
        owner.user_name,
        owner.user_email
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
  user_landlord_id?: number | null;
  role_name: string;
  status_name: string;
}) {
  try {
    const roleId = await resolveRoleId(input.role_name);
    const statusId = await resolveStatusId(input.status_name);
    const passwordHash = await hashPassword(input.user_password);
    const landlordOwnerId = input.role_name === 'tenant' ? input.user_landlord_id ?? null : null;
    const landlordRegistrationCode = input.role_name === 'landlord'
      ? await generateUniqueLandlordRegistrationCode(pool)
      : null;

    if (input.role_name === 'tenant') {
      if (landlordOwnerId === null) {
        throw new AppError(400, 'Tenant accounts must be assigned to a landlord owner.');
      }

      await assertLandlordExists(landlordOwnerId);
    }

    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO tblusers (
          user_role_id,
          user_status_id,
          user_landlord_id,
          landlord_registration_code,
          user_name,
          user_email,
          user_password,
          user_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        roleId,
        statusId,
        landlordOwnerId,
        landlordRegistrationCode,
        input.user_name,
        input.user_email,
        passwordHash,
        input.user_phone ? normalizePhilippinePhone(input.user_phone) : null,
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
    user_landlord_id: number | null;
    role_name: string;
    status_name: string;
  }>,
) {
  const currentUser = await getUserById(userId);
  const nextRoleName = input.role_name ?? currentUser.roleName;
  const nextLandlordOwnerId =
    nextRoleName === 'tenant'
      ? input.user_landlord_id !== undefined
        ? input.user_landlord_id
        : currentUser.landlordOwnerId
      : null;
  const nextLandlordRegistrationCode =
    nextRoleName === 'landlord'
      ? currentUser.landlordRegistrationCode ?? await generateUniqueLandlordRegistrationCode(pool)
      : null;

  if (nextRoleName === 'tenant') {
    if (nextLandlordOwnerId === null) {
      throw new AppError(400, 'Tenant accounts must be assigned to a landlord owner.');
    }

    await assertLandlordExists(nextLandlordOwnerId);
  }

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
    values.push(input.user_phone ? normalizePhilippinePhone(input.user_phone) : null);
  }

  if (input.user_landlord_id !== undefined || input.role_name !== undefined) {
    fields.push('user_landlord_id = ?');
    values.push(nextLandlordOwnerId);
  }

  if (input.role_name !== undefined || currentUser.roleName === 'landlord') {
    fields.push('landlord_registration_code = ?');
    values.push(nextLandlordRegistrationCode);
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

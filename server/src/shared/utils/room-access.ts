import { RowDataPacket } from 'mysql2';

import { pool } from '../../config/db';
import { AuthenticatedUser } from '../types/auth';
import { AppError } from './app-error';

export async function assertRoomAccess(user: AuthenticatedUser, roomId: number) {
  if (user.roleName === 'admin') {
    return;
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT room_id
      FROM tblrooms
      WHERE room_id = ? AND room_tenant_id = ?
      LIMIT 1
    `,
    [roomId, user.userId],
  );

  if (!rows[0]) {
    throw new AppError(403, 'You are not allowed to access this room.');
  }
}

export async function getTenantRoomIds(userId: number): Promise<number[]> {
  const [rows] = await pool.query<Array<RowDataPacket & { room_id: number }>>(
    `
      SELECT room_id
      FROM tblrooms
      WHERE room_tenant_id = ?
      ORDER BY room_id
    `,
    [userId],
  );

  return rows.map((row) => row.room_id);
}

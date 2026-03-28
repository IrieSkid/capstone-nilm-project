import crypto from 'node:crypto';

import { RowDataPacket } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';

import { pool } from '../../config/db';

interface ExistingCodeRow extends RowDataPacket {
  user_id: number;
}

type Queryable = Pick<Pool, 'query'> | Pick<PoolConnection, 'query'>;

const LANDLORD_CODE_PREFIX = 'LLD';
const LANDLORD_CODE_LENGTH = 6;
const MAX_GENERATION_ATTEMPTS = 20;

export function normalizeLandlordRegistrationCode(code: string) {
  return code.trim().toUpperCase();
}

function createCandidateLandlordRegistrationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomBytes = crypto.randomBytes(LANDLORD_CODE_LENGTH);
  let suffix = '';

  for (let index = 0; index < LANDLORD_CODE_LENGTH; index += 1) {
    suffix += alphabet[randomBytes[index] % alphabet.length];
  }

  return `${LANDLORD_CODE_PREFIX}-${suffix}`;
}

async function landlordCodeExists(queryable: Queryable, landlordCode: string) {
  const [rows] = await queryable.query<ExistingCodeRow[]>(
    `
      SELECT user_id
      FROM tblusers
      WHERE landlord_registration_code = ?
      LIMIT 1
    `,
    [landlordCode],
  );

  return Boolean(rows[0]);
}

export async function generateUniqueLandlordRegistrationCode(queryable: Queryable = pool) {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const landlordCode = createCandidateLandlordRegistrationCode();

    if (!(await landlordCodeExists(queryable, landlordCode))) {
      return landlordCode;
    }
  }

  throw new Error('Unable to generate a unique landlord registration code.');
}

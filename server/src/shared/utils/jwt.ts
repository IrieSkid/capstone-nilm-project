import jwt, { SignOptions } from 'jsonwebtoken';

import { env } from '../../config/env';
import { AccessTokenPayload, AuthenticatedUser } from '../types/auth';

export function signAccessToken(user: AuthenticatedUser): string {
  const payload: AccessTokenPayload = {
    userId: user.userId,
    roleName: user.roleName,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

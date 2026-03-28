import { NextFunction, Request, Response } from 'express';

import { findAuthenticatedUserById } from '../../modules/auth/auth.service';
import { AppModuleKey, RoleName } from '../types/auth';
import { AppError } from '../utils/app-error';
import { verifyAccessToken } from '../utils/jwt';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Authentication required.');
    }

    const token = authorizationHeader.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    const user = await findAuthenticatedUserById(payload.userId);

    if (!user) {
      throw new AppError(401, 'User not found.');
    }

    if (user.statusName !== 'active') {
      throw new AppError(403, 'Your account is not active.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required.'));
    }

    if (!roles.includes(req.user.roleName)) {
      return next(new AppError(403, 'You are not allowed to access this resource.'));
    }

    return next();
  };
}

export function authorizePermission(moduleKey: AppModuleKey) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required.'));
    }

    if (req.user.roleName === 'admin') {
      return next();
    }

    if (!req.user.permissions.includes(moduleKey)) {
      return next(
        new AppError(403, 'This module is currently disabled for your role by the administrator.'),
      );
    }

    return next();
  };
}

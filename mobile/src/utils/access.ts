import { AppModuleKey, RoleName, User } from '../types/models';

export function hasRoleAccess(roleName: RoleName, allowedRoles: RoleName[]) {
  return allowedRoles.includes(roleName);
}

export function hasModuleAccess(user: User, moduleKey: AppModuleKey) {
  return user.roleName === 'admin' || user.permissions.includes(moduleKey);
}

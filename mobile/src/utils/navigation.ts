import { AppModuleKey, RoleName, User } from '../types/models';
import { hasModuleAccess, hasRoleAccess } from './access';

export type AppPath =
  | '/(app)/dashboard'
  | '/(app)/billing'
  | '/(app)/users'
  | '/(app)/rooms'
  | '/(app)/devices'
  | '/(app)/landlord-rooms'
  | '/(app)/landlord-tenants'
  | '/(app)/landlord-tenant-requests'
  | '/(app)/landlord-devices'
  | '/(app)/landlord-billing'
  | '/(app)/access-control'
  | '/(app)/profile';

export interface AppMenuItem {
  label: string;
  path: AppPath;
  roles: RoleName[];
  permissionKey?: AppModuleKey;
}

export const appMenuItems: AppMenuItem[] = [
  {
    label: 'Dashboard',
    path: '/(app)/dashboard',
    roles: ['admin', 'tenant'],
    permissionKey: 'dashboard.view',
  },
  {
    label: 'Billing',
    path: '/(app)/billing',
    roles: ['tenant'],
    permissionKey: 'tenant.billing.view',
  },
  {
    label: 'Dashboard',
    path: '/(app)/dashboard',
    roles: ['landlord'],
    permissionKey: 'landlord.dashboard.view',
  },
  { label: 'Users', path: '/(app)/users', roles: ['admin'], permissionKey: 'users.view' },
  { label: 'Rooms', path: '/(app)/rooms', roles: ['admin'], permissionKey: 'rooms.view' },
  {
    label: 'Devices',
    path: '/(app)/devices',
    roles: ['admin'],
    permissionKey: 'devices.view',
  },
  {
    label: 'Rooms',
    path: '/(app)/landlord-rooms',
    roles: ['landlord'],
    permissionKey: 'landlord.rooms.view',
  },
  {
    label: 'Tenants',
    path: '/(app)/landlord-tenants',
    roles: ['landlord'],
    permissionKey: 'landlord.tenants.view',
  },
  {
    label: 'Requests',
    path: '/(app)/landlord-tenant-requests',
    roles: ['landlord'],
    permissionKey: 'landlord.tenant_requests.view',
  },
  {
    label: 'Devices',
    path: '/(app)/landlord-devices',
    roles: ['landlord'],
    permissionKey: 'landlord.devices.view',
  },
  {
    label: 'Billing',
    path: '/(app)/landlord-billing',
    roles: ['landlord'],
    permissionKey: 'landlord.billing.view',
  },
  {
    label: 'Access',
    path: '/(app)/access-control',
    roles: ['admin'],
    permissionKey: 'rbac.manage',
  },
  {
    label: 'Profile',
    path: '/(app)/profile',
    roles: ['admin', 'landlord', 'tenant'],
    permissionKey: 'profile.manage',
  },
];

export function canAccessMenuItem(user: User, item: AppMenuItem) {
  if (!hasRoleAccess(user.roleName, item.roles)) {
    return false;
  }

  if (!item.permissionKey) {
    return true;
  }

  return hasModuleAccess(user, item.permissionKey);
}

export function getMenuForUser(user: User) {
  return appMenuItems.filter((item) => canAccessMenuItem(user, item));
}

export function getDefaultAppPath(user: User): AppPath {
  return getMenuForUser(user)[0]?.path ?? '/(app)/profile';
}

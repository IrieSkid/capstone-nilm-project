import { RoleName } from '../types/models';

export interface AppMenuItem {
  label: string;
  path: '/(app)/dashboard' | '/(app)/users' | '/(app)/rooms' | '/(app)/devices' | '/(app)/profile';
  roles: RoleName[];
}

export const appMenuItems: AppMenuItem[] = [
  { label: 'Dashboard', path: '/(app)/dashboard', roles: ['admin', 'tenant'] },
  { label: 'Users', path: '/(app)/users', roles: ['admin'] },
  { label: 'Rooms', path: '/(app)/rooms', roles: ['admin'] },
  { label: 'Devices', path: '/(app)/devices', roles: ['admin'] },
  { label: 'Profile', path: '/(app)/profile', roles: ['admin', 'tenant'] },
];

export function getMenuForRole(roleName: RoleName) {
  return appMenuItems.filter((item) => item.roles.includes(roleName));
}

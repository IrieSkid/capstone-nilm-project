import { AppModuleKey, RoleName } from '../types/auth';

export const ALL_APP_MODULE_KEYS: AppModuleKey[] = [
  'dashboard.view',
  'profile.manage',
  'users.view',
  'users.create',
  'users.update',
  'rooms.view',
  'rooms.create',
  'rooms.update',
  'rooms.delete',
  'devices.view',
  'devices.create',
  'devices.update',
  'tenant.billing.view',
  'port_control.use',
  'landlord.dashboard.view',
  'landlord.rooms.view',
  'landlord.rooms.create',
  'landlord.rooms.update',
  'landlord.tenants.view',
  'landlord.tenants.assign',
  'landlord.tenant_requests.view',
  'landlord.tenant_requests.approve',
  'landlord.billing.view',
  'landlord.billing.manage',
  'landlord.devices.view',
  'landlord.devices.assign',
  'rbac.manage',
];

export const SUPPORTED_ROLE_MODULES: Record<RoleName, AppModuleKey[]> = {
  admin: [...ALL_APP_MODULE_KEYS],
  tenant: ['dashboard.view', 'profile.manage', 'tenant.billing.view', 'port_control.use'],
  landlord: [
    'profile.manage',
    'landlord.dashboard.view',
    'landlord.rooms.view',
    'landlord.rooms.create',
    'landlord.rooms.update',
    'landlord.tenants.view',
    'landlord.tenants.assign',
    'landlord.tenant_requests.view',
    'landlord.tenant_requests.approve',
    'landlord.billing.view',
    'landlord.billing.manage',
    'landlord.devices.view',
    'landlord.devices.assign',
  ],
};

export function isAppModuleKey(value: string): value is AppModuleKey {
  return ALL_APP_MODULE_KEYS.includes(value as AppModuleKey);
}

export function getSupportedModulesForRole(roleName: RoleName) {
  return SUPPORTED_ROLE_MODULES[roleName] ?? [];
}

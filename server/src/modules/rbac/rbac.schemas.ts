import { z } from 'zod';

export const roleIdParamSchema = z.object({
  roleId: z.coerce.number().int().positive(),
});

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const moduleKeyParamSchema = z.object({
  moduleKey: z.enum([
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
  ]),
});

export const updateRoleModulePermissionBodySchema = z.object({
  can_access: z.boolean(),
});

export const updateUserModulePermissionBodySchema = z.object({
  override_state: z.enum(['inherit', 'allow', 'deny']),
});

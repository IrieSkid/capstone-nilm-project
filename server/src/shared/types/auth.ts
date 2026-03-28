export type RoleName = 'admin' | 'landlord' | 'tenant';
export type AppModuleKey =
  | 'dashboard.view'
  | 'profile.manage'
  | 'users.view'
  | 'users.create'
  | 'users.update'
  | 'rooms.view'
  | 'rooms.create'
  | 'rooms.update'
  | 'rooms.delete'
  | 'devices.view'
  | 'devices.create'
  | 'devices.update'
  | 'tenant.billing.view'
  | 'port_control.use'
  | 'landlord.dashboard.view'
  | 'landlord.rooms.view'
  | 'landlord.rooms.create'
  | 'landlord.rooms.update'
  | 'landlord.tenants.view'
  | 'landlord.tenants.assign'
  | 'landlord.tenant_requests.view'
  | 'landlord.tenant_requests.approve'
  | 'landlord.billing.view'
  | 'landlord.billing.manage'
  | 'landlord.devices.view'
  | 'landlord.devices.assign'
  | 'rbac.manage';

export interface AuthenticatedUser {
  userId: number;
  userName: string;
  userEmail: string;
  roleId: number;
  roleName: RoleName;
  statusId: number;
  statusName: string;
  landlordOwnerId: number | null;
  landlordOwnerName: string | null;
  landlordOwnerEmail: string | null;
  landlordOwnerPhone: string | null;
  adminSupportName: string | null;
  adminSupportEmail: string | null;
  adminSupportPhone: string | null;
  landlordRegistrationCode: string | null;
  userPhone: string | null;
  createdAt: string;
  permissions: AppModuleKey[];
}

export interface AccessTokenPayload {
  userId: number;
  roleName: RoleName;
}

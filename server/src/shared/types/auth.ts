export type RoleName = 'admin' | 'landlord' | 'tenant';

export interface AuthenticatedUser {
  userId: number;
  userName: string;
  userEmail: string;
  roleId: number;
  roleName: RoleName;
  statusId: number;
  statusName: string;
  userPhone: string | null;
  createdAt: string;
}

export interface AccessTokenPayload {
  userId: number;
  roleName: RoleName;
}

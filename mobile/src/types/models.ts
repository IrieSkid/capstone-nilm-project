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
export type UserOverrideState = 'inherit' | 'allow' | 'deny';

export interface User {
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

export interface UserRecord {
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  createdAt: string;
  roleName: string;
  statusName: string;
  landlordOwnerId: number | null;
  landlordOwnerName: string | null;
  landlordOwnerEmail: string | null;
  landlordRegistrationCode: string | null;
  assignedRooms: string[];
}

export interface UsersPayload {
  users: UserRecord[];
  roles: Array<string | undefined>;
  statuses: Array<string | undefined>;
}

export interface Device {
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
  deviceOwnerLandlordId: number | null;
  deviceOwnerLandlordName: string | null;
  deviceOwnerLandlordEmail?: string | null;
  deviceStatus: 'online' | 'offline';
  computedStatus: 'online' | 'offline';
  deviceLastSeen: string | null;
  deviceUptimeSeconds: number | null;
  createdAt?: string;
  roomId: number | null;
  roomName: string | null;
  tenantId?: number | null;
  tenantName?: string | null;
  landlordId?: number | null;
  landlordName?: string | null;
}

export interface Room {
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  roomStatus: 'available' | 'occupied';
  landlordId: number | null;
  landlordName: string | null;
  landlordEmail: string | null;
  tenantId: number | null;
  tenantName: string | null;
  tenantEmail: string | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceIdentifier: string | null;
}

export interface Reading {
  readingId: number;
  roomId: number;
  roomName: string;
  timestamp: string;
  voltage: number;
  current: number;
  powerW: number;
  frequency: number;
  powerFactor: number;
  thdPercentage: number;
  energyKwh: number;
  estimatedCost: number;
  likelyActiveAppliance: string | null;
  detectionConfidence: number | null;
  detections: DetectedAppliance[];
}

export interface DetectedAppliance {
  detectionDetailId?: number;
  rank: number;
  applianceTypeId: number;
  applianceTypeName: string;
  devicePortId?: number | null;
  portLabel?: string | null;
  categoryName: string;
  powerPattern: string;
  status: 'ON' | 'OFF';
  confidence: number;
  detectedPower: number;
  detectedFrequency: number;
  detectedThd: number;
  powerShare: number;
  applianceUptimeSeconds?: number | null;
  scoreBreakdown?: {
    powerSimilarity: number;
    powerFactorSimilarity: number;
    frequencySimilarity: number;
    thdSimilarity: number;
  };
}

export interface DevicePort {
  devicePortId: number;
  deviceId: number;
  roomId: number;
  roomName: string;
  portLabel: string;
  supplyState: 'on' | 'off';
  lastChangedAt: string;
  lastChangedByUserId: number | null;
  lastChangedByName: string | null;
  createdAt: string;
  applianceTypeId: number;
  applianceTypeName: string;
  categoryName: string;
  powerPattern: string;
  applianceUptimeSeconds: number | null;
}

export interface Detection {
  detectionHeaderId: number;
  detectedAt: string;
  applianceTypeId: number | null;
  applianceTypeName: string | null;
  categoryName: string | null;
  status: 'ON' | 'OFF' | null;
  confidence: number | null;
  detectedPower: number | null;
  detectedFrequency: number | null;
  detectedThd: number | null;
  appliances: DetectedAppliance[];
}

export interface TenantRoomSummary {
  roomId: number;
  roomName: string;
  roomStatus: 'available' | 'occupied';
  roomRatePerKwh: number;
  landlordId: number | null;
  landlordName: string | null;
  landlordEmail: string | null;
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
  deviceUptimeSeconds: number | null;
  currentPowerUsage: number | null;
  latestEnergyKwh: number | null;
  likelyActiveAppliance: string | null;
  detectionConfidence: number | null;
  activeAppliances: DetectedAppliance[];
  devicePorts: DevicePort[];
  estimatedElectricityCost: number | null;
  latestReadingAt: string | null;
  recentHistory: Reading[];
}

export interface TenantDashboardData {
  rooms: TenantRoomSummary[];
  summary: {
    totalRooms: number;
  };
}

export interface AdminRoomSummary {
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  roomStatus: 'available' | 'occupied';
  tenantId: number | null;
  tenantName: string | null;
  tenantEmail: string | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceIdentifier: string | null;
  deviceUptimeSeconds: number | null;
  latestReading: Reading | null;
  latestDetection: Detection | null;
  devicePorts: DevicePort[];
}

export interface AdminDashboardData {
  totals: {
    totalRooms: number;
    totalDevices: number;
    totalUsers: number;
  };
  highestConsumingRoom: {
    roomId: number;
    roomName: string;
    tenantName: string | null;
    currentPowerUsage: number | null;
    estimatedCost: number | null;
  } | null;
  roomSummaries: AdminRoomSummary[];
  devices: Device[];
  quickLinks: {
    rooms: string;
    devices: string;
    users: string;
  };
}

export interface LandlordRoomSnapshot {
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  roomStatus: 'available' | 'occupied';
  tenantId: number | null;
  tenantName: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceIdentifier: string | null;
  deviceUptimeSeconds: number | null;
  estimatedMonthlyCost: number | null;
  latestReading: Reading | null;
  latestDetection: Detection | null;
  devicePorts: DevicePort[];
  alertSettings: RoomAlertSettings;
}

export interface RoomAlertSettings {
  roomId: number;
  roomName: string;
  warningPowerW: number;
  overloadPowerW: number;
  notifyTenant: boolean;
  notifyLandlord: boolean;
  notifyAdmin: boolean;
}

export interface LandlordAssignableTenant {
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  assignedRoomId: number | null;
  assignedRoomName: string | null;
}

export interface LandlordAssignableDevice {
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
  assignedRoomId: number | null;
  assignedRoomName: string | null;
  computedStatus: 'online' | 'offline';
  deviceLastSeen: string | null;
}

export interface LandlordRoomManagementOptions {
  tenants: LandlordAssignableTenant[];
  devices: LandlordAssignableDevice[];
}

export interface LandlordDashboardData {
  summary: {
    totalOwnedRooms: number;
    occupiedRooms: number;
    vacantRooms: number;
    totalRealtimeCostPerHour: number;
    totalEstimatedMonthlyCost: number;
    totalTenants: number;
    pendingTenantRequests: number;
    offlineDevices: number;
  };
  landlordRegistrationCode: string | null;
  highestConsumingRoom: {
    roomId: number;
    roomName: string;
    tenantName: string | null;
    currentPowerUsage: number | null;
    estimatedMonthlyCost: number | null;
  } | null;
  roomSnapshots: LandlordRoomSnapshot[];
}

export interface LandlordPendingTenantRequest {
  tenantId: number;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string | null;
  createdAt: string;
  statusName: string;
  landlordOwnerId: number;
  landlordOwnerName: string;
}

export interface LandlordTenantRecord {
  tenantId: number;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string | null;
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  deviceIdentifier: string | null;
  currentPowerUsage: number | null;
  estimatedMonthlyCost: number | null;
  latestReadingAt: string | null;
}

export interface LandlordDeviceRecord {
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
  roomId: number | null;
  roomName: string | null;
  tenantName: string | null;
  computedStatus: 'online' | 'offline';
  deviceLastSeen: string | null;
  deviceUptimeSeconds: number | null;
  latestPowerW: number | null;
}

export interface LandlordBillingSummary {
  summary: {
    totalEstimatedMonthlyCost: number;
    totalRealtimeCostPerHour: number;
    occupiedRooms: number;
    billableRooms: number;
  };
  rooms: Array<{
    roomId: number;
    roomName: string;
    tenantName: string | null;
    deviceIdentifier: string | null;
    roomRatePerKwh: number;
    currentPowerUsage: number | null;
    estimatedMonthlyCost: number | null;
    latestEnergyKwh: number | null;
    latestReadingAt: string | null;
  }>;
}

export interface BillingCycleRecord {
  cycleId: number;
  roomId: number;
  roomName: string;
  roomStatus: 'available' | 'occupied';
  tenantId: number;
  tenantName: string | null;
  tenantEmail: string | null;
  deviceId: number;
  deviceName: string | null;
  deviceIdentifier: string | null;
  periodStart: string;
  periodEnd: string;
  status: 'open' | 'closed' | 'statement_issued' | 'cancelled';
  ratePerKwhSnapshot: number;
  openingReadingId: number;
  openingEnergyKwh: number;
  latestReadingId: number | null;
  latestReadingAt: string | null;
  latestPowerW: number | null;
  latestEnergyKwh: number | null;
  cycleToDateKwh: number;
  projectedCurrentBill: number;
  closedAt: string | null;
  createdAt: string;
}

export interface BillingStatementItem {
  itemId: number;
  label: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitAmount: number;
  totalAmount: number;
  sortOrder: number;
}

export interface BillingStatementRecord {
  statementId: number;
  statementNumber: string | null;
  cycleId: number;
  roomId: number;
  roomName: string;
  roomStatus: 'available' | 'occupied';
  tenantId: number;
  tenantName: string | null;
  tenantEmail: string | null;
  deviceId: number;
  deviceName: string | null;
  deviceIdentifier: string | null;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';
  openingReadingId: number;
  closingReadingId: number;
  openingEnergyKwh: number;
  closingEnergyKwh: number;
  billedKwh: number;
  ratePerKwhSnapshot: number;
  subtotalAmount: number;
  adjustmentsAmount: number;
  totalAmount: number;
  approvedPaymentsAmount: number;
  pendingPaymentsAmount: number;
  rejectedPaymentsAmount: number;
  outstandingAmount: number;
  availableToSubmitAmount: number;
  paymentCount: number;
  receiptCount: number;
  daysUntilDue: number | null;
  isDueSoon: boolean;
  isOverdue: boolean;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: BillingStatementItem[];
}

export interface BillingPaymentRecord {
  paymentId: number;
  statementId: number;
  statementNumber: string | null;
  statementStatus: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';
  statementTotalAmount: number;
  statementDueDate: string | null;
  roomId: number;
  roomName: string;
  tenantId: number;
  tenantName: string | null;
  landlordId: number;
  landlordName: string | null;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  submittedAt: string;
  verifiedAt: string | null;
  verifiedByUserId: number | null;
  verifiedByName: string | null;
  receiptId: number | null;
  receiptNumber: string | null;
  receiptIssuedAt: string | null;
}

export interface BillingReceiptRecord {
  receiptId: number;
  paymentId: number;
  statementId: number;
  statementNumber: string | null;
  roomId: number;
  roomName: string;
  tenantId: number;
  tenantName: string | null;
  landlordId: number;
  landlordName: string | null;
  receiptNumber: string;
  amount: number;
  notes: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
  issuedAt: string;
  createdAt: string;
}

export interface NotificationRecord {
  notificationId: number;
  type: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: number | null;
  actionPath: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  statementNumber: string | null;
  statementTotalAmount: number | null;
  statementDueDate: string | null;
  statementRoomName: string | null;
}

export interface NotificationSummaryData {
  totalNotifications: number;
  unreadNotifications: number;
  actionNeededNotifications: number;
  criticalNotifications: number;
}

export interface NotificationPreferenceRecord {
  key: string;
  label: string;
  description: string;
  category: 'billing' | 'monitoring' | 'requests';
  enabled: boolean;
  defaultEnabled: boolean;
}

export interface NotificationPreferencesData {
  summary: {
    totalPreferences: number;
    enabledPreferences: number;
  };
  preferences: NotificationPreferenceRecord[];
}

export interface LandlordCurrentBillingData {
  summary: {
    ownedRooms: number;
    openCycles: number;
    roomsWithoutOpenCycle: number;
    totalCycleToDateKwh: number;
    totalProjectedCurrentBill: number;
  };
  cycles: BillingCycleRecord[];
}

export interface LandlordBillingStatementsData {
  summary: {
    readyCycles: number;
    draftStatements: number;
    issuedStatements: number;
    totalDraftAmount: number;
    totalIssuedAmount: number;
    pendingPayments: number;
    collectedAmount: number;
    outstandingAmount: number;
    dueSoonStatements: number;
    overdueStatements: number;
    receiptsIssued: number;
  };
  readyCycles: BillingCycleRecord[];
  statements: BillingStatementRecord[];
  payments: BillingPaymentRecord[];
  receipts: BillingReceiptRecord[];
  pendingPayments: BillingPaymentRecord[];
  dueSoonStatements: BillingStatementRecord[];
  overdueStatements: BillingStatementRecord[];
}

export interface TenantCurrentBillingData {
  summary: {
    assignedRooms: number;
    activeCycles: number;
    roomsWithoutOpenCycle: number;
    totalCycleToDateKwh: number;
    totalProjectedCurrentBill: number;
    issuedStatements: number;
    totalOutstandingAmount: number;
    totalApprovedPayments: number;
    pendingPayments: number;
    receiptsIssued: number;
  };
  cycles: BillingCycleRecord[];
  statements: BillingStatementRecord[];
  payments: BillingPaymentRecord[];
  receipts: BillingReceiptRecord[];
}

export interface NotificationsData {
  summary: NotificationSummaryData;
  notifications: NotificationRecord[];
}

export type BillingNotificationsData = NotificationsData;

export interface LoginPayload {
  token: string;
  user: User;
}

export interface RoleModuleAccess {
  moduleId: number;
  moduleKey: AppModuleKey;
  moduleName: string;
  moduleDescription: string | null;
  canAccess: boolean;
  locked: boolean;
}

export interface RoleAccessMatrixItem {
  roleId: number;
  roleName: RoleName;
  isEditable: boolean;
  modules: RoleModuleAccess[];
}

export interface RoleAccessMatrix {
  roles: RoleAccessMatrixItem[];
  users: UserAccessMatrixItem[];
  auditLogs: RbacAuditLog[];
}

export interface UserModuleAccess {
  moduleId: number;
  moduleKey: AppModuleKey;
  moduleName: string;
  moduleDescription: string | null;
  roleCanAccess: boolean;
  overrideState: UserOverrideState;
  effectiveCanAccess: boolean;
  locked: boolean;
}

export interface UserAccessMatrixItem {
  userId: number;
  userName: string;
  userEmail: string;
  roleId: number;
  roleName: RoleName;
  statusName: string;
  isEditable: boolean;
  modules: UserModuleAccess[];
}

export interface RbacAuditLog {
  auditLogId: number;
  changedByUserId: number;
  changedByName: string;
  targetScope: 'role' | 'user';
  targetRoleId: number | null;
  targetRoleName: RoleName | null;
  targetUserId: number | null;
  targetUserName: string | null;
  targetUserEmail: string | null;
  moduleKey: AppModuleKey;
  moduleName: string;
  previousState: string;
  nextState: string;
  createdAt: string;
}

export interface IngestPayloadResult {
  reading: {
    readingId: number;
    roomId: number;
    roomName: string | null;
    deviceId: number;
    deviceIdentifier: string;
    timestamp: string;
    voltage: number;
    current: number;
    powerW: number;
    frequency: number;
    powerFactor: number;
    thdPercentage: number;
    energyKwh: number;
  };
  detection: {
    applianceTypeId: number;
    applianceTypeName: string;
    categoryName: string;
    confidence: number;
    scoreBreakdown: {
      powerSimilarity: number;
      powerFactorSimilarity: number;
      frequencySimilarity: number;
      thdSimilarity: number;
    };
    powerPattern: string;
  } | null;
  detections: DetectedAppliance[];
  estimatedCost: number;
}

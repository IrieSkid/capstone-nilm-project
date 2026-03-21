export type RoleName = 'admin' | 'landlord' | 'tenant';

export interface User {
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

export interface UserRecord {
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  createdAt: string;
  roleName: string;
  statusName: string;
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
  deviceStatus: 'online' | 'offline';
  computedStatus: 'online' | 'offline';
  deviceLastSeen: string | null;
  createdAt?: string;
  roomId: number | null;
  roomName: string | null;
}

export interface Room {
  roomId: number;
  roomName: string;
  roomRatePerKwh: number;
  roomStatus: 'available' | 'occupied';
  tenantId: number;
  tenantName: string;
  tenantEmail: string;
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
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
}

export interface DetectedAppliance {
  detectionDetailId?: number;
  rank: number;
  applianceTypeId: number;
  applianceTypeName: string;
  categoryName: string;
  powerPattern: string;
  status: 'ON' | 'OFF';
  confidence: number;
  detectedPower: number;
  detectedFrequency: number;
  detectedThd: number;
  powerShare: number;
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
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
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
  tenantId: number;
  tenantName: string;
  tenantEmail: string;
  deviceId: number;
  deviceName: string;
  deviceIdentifier: string;
  latestReading: Reading | null;
  latestDetection: Detection | null;
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
    tenantName: string;
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

export interface LoginPayload {
  token: string;
  user: User;
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

export type RoleName = 'admin' | 'landlord' | 'tenant';
export type MonitoringRange = 'live' | '1h' | '24h' | '7d' | '30d';
export type ReportRange = '24h' | '7d' | '30d';
export type DeviceStatus = 'online' | 'offline' | 'unassigned';
export type HardwareHealthStatus = 'healthy' | 'delayed' | 'pzem_error' | 'upload_error' | 'offline' | 'unassigned';

export interface User {
  userId: number;
  userName: string;
  userEmail: string;
  roleName: RoleName;
  statusName: string;
  permissions: string[];
}

export interface LoginPayload {
  token: string;
  user: User;
}

export interface MonitoringRoom {
  roomId: number;
  roomName: string;
  roomStatus: 'available' | 'occupied';
  ratePerKwh: number;
  deviceId: number | null;
  deviceName: string | null;
  deviceIdentifier: string | null;
  deviceStatus: DeviceStatus;
  deviceLastSeen: string | null;
  latestReadingAt?: string | null;
  latestPowerW?: number | null;
  latestEnergyKwh?: number | null;
}

export interface MonitoringReading {
  timestamp: string;
  voltage: number | null;
  current: number | null;
  powerW: number | null;
  apparentPowerVa: number | null;
  frequency: number | null;
  powerFactor: number | null;
  energyKwh: number | null;
}

export interface MonitoringSummary {
  sampleCount: number;
  firstReadingAt: string | null;
  lastReadingAt: string | null;
  averageVoltage: number | null;
  minimumVoltage: number | null;
  maximumVoltage: number | null;
  averageCurrent: number | null;
  maximumCurrent: number | null;
  averagePowerW: number | null;
  peakPowerW: number | null;
  averagePowerFactor: number | null;
  averageFrequency: number | null;
  measuredEnergyKwh: number | null;
  measuredCost: number | null;
  counterResetDetected: boolean;
}

export interface MonthlyProjection {
  status: 'unavailable' | 'counter_reset' | 'insufficient_data' | 'provisional' | 'available';
  measuredEnergyKwh: number | null;
  measuredCost: number | null;
  observedHours: number | null;
  projectedMonthlyEnergyKwh: number | null;
  projectedMonthlyCost: number | null;
  minimumObservationHours: number;
}

export interface DeviceHeartbeat {
  receivedAt: string;
  deviceTime: string | null;
  uptimeSeconds: number;
  wifiRssiDbm: number | null;
  pzemOk: boolean;
  lastReadingHttpStatus: number | null;
  firmwareVersion: string;
  errorCode: string | null;
}

export interface SamplingQuality {
  evaluatedWindowSeconds: number;
  expectedIntervalSeconds: number;
  sampleCount: number;
  expectedSampleCount: number;
  estimatedMissingSamples: number;
  coveragePercentage: number | null;
  firstReadingAt: string | null;
  lastReadingAt: string | null;
  observedSpanSeconds: number | null;
  averageIntervalSeconds: number | null;
  longestGapSeconds: number | null;
  gapCount: number;
}

export interface HardwareHealth {
  status: HardwareHealthStatus;
  message: string;
  heartbeatSupported: boolean;
  offlineAfterSeconds: number;
  delayedAfterSeconds: number;
  lastSeenAt: string | null;
  lastSeenAgeSeconds: number | null;
  lastReadingAt: string | null;
  lastReadingAgeSeconds: number | null;
  heartbeat: DeviceHeartbeat | null;
  samplingQuality: SamplingQuality;
}

export interface MonitoringDashboard {
  generatedAt: string;
  range: MonitoringRange;
  room: MonitoringRoom;
  latest: MonitoringReading | null;
  summary: MonitoringSummary;
  monthlyProjection: MonthlyProjection;
  hardwareHealth: HardwareHealth;
  history: MonitoringReading[];
}

export interface MonitoringReport extends MonitoringDashboard {
  reportTitle: string;
}

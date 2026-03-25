import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import {
  AdminDashboardData,
  DetectedAppliance,
  DevicePort,
  TenantDashboardData,
} from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import {
  formatConfidence,
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatNumber,
} from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const DASHBOARD_REALTIME_INTERVAL_MS = 2000;

const MONTHLY_DAYS = 30;
const FALLBACK_DAILY_USAGE_HOURS = 8;

function getTypicalDailyUsageHours(applianceTypeName: string) {
  const normalizedName = applianceTypeName.trim().toLowerCase();

  if (normalizedName.includes('inverter air conditioner') || normalizedName.includes('air conditioner')) {
    return 8;
  }

  if (normalizedName.includes('electric fan')) {
    return 8;
  }

  if (normalizedName.includes('refrigerator')) {
    return 10;
  }

  if (normalizedName.includes('rice cooker')) {
    return 1.5;
  }

  if (normalizedName.includes('led tv')) {
    return 5;
  }

  return FALLBACK_DAILY_USAGE_HOURS;
}

function getEstimatedMonthlyCost(input: {
  powerW: number | null | undefined;
  roomRatePerKwh: number;
  appliances?: DetectedAppliance[] | null;
}) {
  if (input.appliances && input.appliances.length > 0) {
    return input.appliances.reduce(
      (sum, appliance) =>
        sum +
        (appliance.detectedPower / 1000) *
          getTypicalDailyUsageHours(appliance.applianceTypeName) *
          MONTHLY_DAYS *
          input.roomRatePerKwh,
      0,
    );
  }

  if (input.powerW === null || input.powerW === undefined) {
    return null;
  }

  return (
    (input.powerW / 1000) *
    FALLBACK_DAILY_USAGE_HOURS *
    MONTHLY_DAYS *
    input.roomRatePerKwh
  );
}

function getRealtimeCostPerHour(powerW: number | null | undefined, roomRatePerKwh: number) {
  if (powerW === null || powerW === undefined) {
    return null;
  }

  return (powerW / 1000) * roomRatePerKwh;
}

export default function DashboardScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { user, token, logout } = useAuth();
  const [data, setData] = useState<AdminDashboardData | TenantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portActionError, setPortActionError] = useState<string | null>(null);
  const [activePortId, setActivePortId] = useState<number | null>(null);
  const requestInFlightRef = useRef(false);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!token || !user || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;

    try {
      if (!options?.silent) {
        setLoading(true);
      }

      const nextData =
        user.roleName === 'admin'
          ? await apiRequest<AdminDashboardData>('/dashboard/admin', { token })
          : await apiRequest<TenantDashboardData>('/dashboard/tenant', { token });

      setData(nextData);
      setError(null);
    } catch (dashboardError) {
      if (isUnauthorized(dashboardError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(dashboardError, 'Unable to load dashboard.'));
    } finally {
      setLoading(false);
      requestInFlightRef.current = false;
    }
  }, [logout, token, user]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();

      const intervalId = setInterval(() => {
        void loadDashboard({ silent: true });
      }, DASHBOARD_REALTIME_INTERVAL_MS);

      return () => {
        clearInterval(intervalId);
      };
    }, [loadDashboard]),
  );

  if (!user) {
    return null;
  }

  async function handleTogglePort(portId: number, supplyState: 'on' | 'off') {
    if (!token || !user || user.roleName !== 'tenant') {
      return;
    }

    try {
      setActivePortId(portId);
      setPortActionError(null);

      await apiRequest(`/device-ports/${portId}`, {
        method: 'PATCH',
        token,
        body: { supplyState },
      });

      await loadDashboard();
      showSuccess(
        supplyState === 'on' ? 'Port turned on' : 'Port turned off',
        `The selected device port is now ${supplyState.toUpperCase()} and the next reading cycle will reflect it.`,
      );

      setTimeout(() => {
        void loadDashboard();
      }, 2500);
    } catch (toggleError) {
      const nextError = getErrorMessage(toggleError, 'Unable to update the port state.');
      setPortActionError(nextError);
      showError('Port update failed', nextError);
    } finally {
      setActivePortId(null);
    }
  }

  return (
    <ScreenShell
      subtitle={
        user.roleName === 'admin'
          ? 'Operational summary for rooms, devices, and the latest NILM detections.'
          : 'Your current room usage, likely appliance, and estimated electricity cost.'
      }
      title={user.roleName === 'admin' ? 'Admin Dashboard' : 'Tenant Dashboard'}>
      {loading && !data ? (
        <SectionCard>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.helperText}>Loading dashboard...</Text>
        </SectionCard>
      ) : null}

      {error ? (
        <SectionCard>
          <Text style={styles.errorTitle}>Dashboard error</Text>
          <Text style={styles.helperText}>{error}</Text>
          <Button label="Retry dashboard" onPress={() => void loadDashboard()} />
        </SectionCard>
      ) : null}

      {!loading && !error && user.roleName === 'admin' && data ? (
        <AdminDashboardView data={data as AdminDashboardData} />
      ) : null}

      {!loading && !error && user.roleName === 'tenant' && data ? (
        <TenantDashboardView
          data={data as TenantDashboardData}
          onTogglePort={(portId, supplyState) => void handleTogglePort(portId, supplyState)}
          activePortId={activePortId}
          portActionError={portActionError}
        />
      ) : null}
    </ScreenShell>
  );
}

function AdminDashboardView({ data }: { data: AdminDashboardData }) {
  const totalConsumption = data.roomSummaries.reduce(
    (sum, room) => sum + (room.latestReading?.powerW ?? 0),
    0,
  );
  const totalRealtimeCostPerHour = data.roomSummaries.reduce(
    (sum, room) =>
      sum + (getRealtimeCostPerHour(room.latestReading?.powerW, room.roomRatePerKwh) ?? 0),
    0,
  );
  const totalEstimatedMonthlyCost = data.roomSummaries.reduce(
    (sum, room) =>
      sum +
        (getEstimatedMonthlyCost({
          powerW: room.latestReading?.powerW,
          roomRatePerKwh: room.roomRatePerKwh,
          appliances: room.latestDetection?.appliances,
        }) ?? 0),
    0,
  );
  const roomsWithReadings = data.roomSummaries.filter((room) => room.latestReading).length;
  const highestConsumingRoomSummary = data.highestConsumingRoom
    ? data.roomSummaries.find((room) => room.roomId === data.highestConsumingRoom?.roomId) ?? null
    : null;
  const highestConsumingRoomMonthlyEstimate = highestConsumingRoomSummary
    ? getEstimatedMonthlyCost(
        {
          powerW: highestConsumingRoomSummary.latestReading?.powerW,
          roomRatePerKwh: highestConsumingRoomSummary.roomRatePerKwh,
          appliances: highestConsumingRoomSummary.latestDetection?.appliances,
        },
      )
    : null;

  return (
    <>
      <View style={styles.metricRow}>
        <MetricCard label="Rooms" value={String(data.totals.totalRooms)} />
        <MetricCard label="Devices" value={String(data.totals.totalDevices)} />
        <MetricCard label="Users" value={String(data.totals.totalUsers)} />
      </View>

      <SectionCard>
        <Text style={styles.sectionTitle}>Total Consumption</Text>
        {data.roomSummaries.length > 0 ? (
          <>
            <Text style={styles.metricValue}>{formatNumber(totalConsumption, 'W')}</Text>
            <Text style={styles.inlineStat}>
              Total real-time cost/hr: {formatCurrency(totalRealtimeCostPerHour)}
            </Text>
            <Text style={styles.inlineStat}>
              Estimated total monthly cost: {formatCurrency(totalEstimatedMonthlyCost)}
            </Text>
            {data.highestConsumingRoom ? (
              <View style={styles.summaryInset}>
                <Text style={styles.applianceGroupTitle}>Highest consuming room</Text>
                <Text style={styles.heroMetric}>{data.highestConsumingRoom.roomName}</Text>
                <Text style={styles.helperText}>
                  {data.highestConsumingRoom.tenantName ?? 'Unassigned tenant'}
                </Text>
                <Text style={styles.inlineStat}>
                  Power: {formatNumber(data.highestConsumingRoom.currentPowerUsage, 'W')}
                </Text>
                <Text style={styles.helperText}>
                  Real-time cost/hr:{' '}
                  {formatCurrency(
                    getRealtimeCostPerHour(
                      highestConsumingRoomSummary?.latestReading?.powerW,
                      highestConsumingRoomSummary?.roomRatePerKwh ?? 0,
                    ),
                  )}
                </Text>
                <Text style={styles.helperText}>
                  Estimated monthly cost: {formatCurrency(highestConsumingRoomMonthlyEstimate)}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <EmptyState
            description="No readings have been ingested yet."
            title="No room consumption yet"
          />
        )}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Latest reading per room</Text>
        {data.roomSummaries.length === 0 ? (
          <EmptyState
            description="Create rooms and assign devices to see admin summaries."
            title="No rooms configured"
          />
        ) : (
          data.roomSummaries.map((room) => {
            const estimatedMonthlyCost = getEstimatedMonthlyCost({
              powerW: room.latestReading?.powerW,
              roomRatePerKwh: room.roomRatePerKwh,
              appliances: room.latestDetection?.appliances,
            });

            return (
              <View key={room.roomId} style={styles.listItem}>
                <Text style={styles.itemTitle}>{room.roomName}</Text>
                <Text style={styles.helperText}>
                  {room.tenantName ?? 'Unassigned tenant'} - {room.deviceIdentifier ?? 'Unassigned device'}
                </Text>
                <Text style={styles.inlineStat}>
                  Power: {formatNumber(room.latestReading?.powerW, 'W')} - Estimated monthly cost:{' '}
                  {formatCurrency(estimatedMonthlyCost)}
                </Text>
                <Text style={styles.helperText}>
                  Device uptime:{' '}
                  {room.deviceUptimeSeconds !== null
                    ? formatDuration(room.deviceUptimeSeconds)
                    : 'Offline'}
                </Text>
                <Text style={styles.inlineStat}>
                  Appliance: {room.latestDetection?.applianceTypeName || 'No confident match'} -
                  Confidence: {formatConfidence(room.latestDetection?.confidence)}
                </Text>
                <ApplianceBreakdown
                  appliances={room.latestDetection?.appliances ?? []}
                  roomRatePerKwh={room.roomRatePerKwh}
                />
                <PortUptimeList ports={room.devicePorts} />
                <Text style={styles.helperText}>
                  Updated {formatDateTime(room.latestReading?.timestamp)}
                </Text>
              </View>
            );
          })
        )}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Device status</Text>
        {data.devices.map((device) => (
          <View key={device.deviceId} style={styles.listItem}>
            <Text style={styles.itemTitle}>{device.deviceName}</Text>
            <Text style={styles.helperText}>{device.deviceIdentifier}</Text>
            <Text
              style={[
                styles.statusText,
                device.computedStatus === 'online' ? styles.online : styles.offline,
              ]}>
              {device.computedStatus.toUpperCase()}
            </Text>
            <Text style={styles.helperText}>Last seen {formatDateTime(device.deviceLastSeen)}</Text>
            <Text style={styles.helperText}>
              Uptime:{' '}
              {device.deviceUptimeSeconds !== null
                ? formatDuration(device.deviceUptimeSeconds)
                : 'Offline'}
            </Text>
          </View>
        ))}
      </SectionCard>
    </>
  );
}

function TenantDashboardView({
  data,
  onTogglePort,
  activePortId,
  portActionError,
}: {
  data: TenantDashboardData;
  onTogglePort: (portId: number, supplyState: 'on' | 'off') => void;
  activePortId: number | null;
  portActionError: string | null;
}) {
  if (data.rooms.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          description="Ask the admin to assign your account to a room and device."
          title="No room assigned yet"
        />
      </SectionCard>
    );
  }

  return (
    <>
      {data.rooms.map((room) => {
        const estimatedMonthlyCost = getEstimatedMonthlyCost({
          powerW: room.currentPowerUsage,
          roomRatePerKwh: room.roomRatePerKwh,
          appliances: room.activeAppliances,
        });

        return (
          <SectionCard key={room.roomId}>
            <Text style={styles.sectionTitle}>{room.roomName}</Text>
            <Text style={styles.helperText}>
              {room.deviceName} - rate {formatCurrency(room.roomRatePerKwh)} / kWh
            </Text>
            <Text style={styles.metricValue}>{formatNumber(room.currentPowerUsage, 'W')}</Text>
            <Text style={styles.inlineStat}>
              Energy: {formatNumber(room.latestEnergyKwh, 'kWh')} - Estimated monthly cost:{' '}
              {formatCurrency(estimatedMonthlyCost)}
            </Text>
          
            <Text style={styles.inlineStat}>
              Appliance: {room.likelyActiveAppliance || 'No confident match'} - Confidence:{' '}
              {formatConfidence(room.detectionConfidence)}
            </Text>
            <ApplianceBreakdown
              appliances={room.activeAppliances}
              roomRatePerKwh={room.roomRatePerKwh}
            />
            <Text style={styles.helperText}>
              Device uptime:{' '}
              {room.deviceUptimeSeconds !== null
                ? formatDuration(room.deviceUptimeSeconds)
                : 'Offline'}
            </Text>
            <Text style={styles.helperText}>Last reading {formatDateTime(room.latestReadingAt)}</Text>

            <Text style={styles.sectionTitle}>Remote port control</Text>
            {room.devicePorts.map((port) => {
              const detectedAppliance = room.activeAppliances.find(
                (appliance) => appliance.applianceTypeId === port.applianceTypeId,
              );

              return (
                <View key={port.devicePortId} style={styles.applianceItem}>
                  <Text style={styles.itemTitle}>
                    {port.portLabel} - {port.applianceTypeName}
                  </Text>
                  <Text style={styles.helperText}>
                    Supply {port.supplyState.toUpperCase()} - {port.categoryName} - {port.powerPattern}
                  </Text>
                  <Text style={styles.helperText}>
                    Appliance uptime:{' '}
                    {port.applianceUptimeSeconds !== null
                      ? formatDuration(port.applianceUptimeSeconds)
                      : 'Currently off'}
                  </Text>
                  <Text style={styles.inlineStat}>
                    {detectedAppliance
                      ? `${formatNumber(detectedAppliance.detectedPower, 'W')} - Confidence ${formatConfidence(detectedAppliance.confidence)}`
                      : 'No live reading while this port is off or not currently detected.'}
                  </Text>
                  <Text style={styles.helperText}>
                    Last changed {formatDateTime(port.lastChangedAt)}
                    {port.lastChangedByName ? ` by ${port.lastChangedByName}` : ''}
                  </Text>
                  <View style={styles.buttonRow}>
                    <Button
                      label="Turn on"
                      loading={activePortId === port.devicePortId && port.supplyState === 'off'}
                      disabled={port.supplyState === 'on' || activePortId === port.devicePortId}
                      onPress={() => onTogglePort(port.devicePortId, 'on')}
                      variant="secondary"
                    />
                    <Button
                      label="Turn off"
                      loading={activePortId === port.devicePortId && port.supplyState === 'on'}
                      disabled={port.supplyState === 'off' || activePortId === port.devicePortId}
                      onPress={() => onTogglePort(port.devicePortId, 'off')}
                      variant="danger"
                    />
                  </View>
                </View>
              );
            })}
            {portActionError ? <Text style={styles.errorText}>{portActionError}</Text> : null}

            <Text style={styles.sectionTitle}>Recent reading history</Text>
            {room.recentHistory.length === 0 ? (
              <EmptyState
                description="Once the feeder or device sends data, readings will appear here."
                title="No readings yet"
              />
            ) : (
              room.recentHistory.map((reading) => {
                const estimatedMonthlyCost = getEstimatedMonthlyCost({
                  powerW: reading.powerW,
                  roomRatePerKwh: room.roomRatePerKwh,
                  appliances: reading.detections,
                });

                return (
                  <View key={reading.readingId} style={styles.listItem}>
                    <Text style={styles.itemTitle}>{formatDateTime(reading.timestamp)}</Text>
                    <Text style={styles.inlineStat}>
                      {formatNumber(reading.powerW, 'W')} - {formatNumber(reading.energyKwh, 'kWh')}
                    </Text>
                    <Text style={styles.helperText}>
                      {reading.detections.length > 0
                        ? reading.detections.map((appliance) => appliance.applianceTypeName).join(' + ')
                        : reading.likelyActiveAppliance || 'No confident match'} - Estimated monthly
                      cost {formatCurrency(estimatedMonthlyCost)}
                    </Text>
                    <ApplianceBreakdown
                      appliances={reading.detections}
                      roomRatePerKwh={room.roomRatePerKwh}
                      title={null}
                    />
                  </View>
                );
              })
            )}
          </SectionCard>
        );
      })}
    </>
  );
}

function PortUptimeList({ ports }: { ports: DevicePort[] }) {
  if (ports.length === 0) {
    return null;
  }

  return (
    <View style={styles.applianceGroup}>
      <Text style={styles.applianceGroupTitle}>Appliance uptime</Text>
      {ports.map((port) => (
        <Text key={port.devicePortId} style={styles.helperText}>
          {port.portLabel} - {port.applianceTypeName} -{' '}
          {port.applianceUptimeSeconds !== null
            ? formatDuration(port.applianceUptimeSeconds)
            : 'Currently off'}
        </Text>
      ))}
    </View>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricCardValue}>{value}</Text>
    </View>
  );
}

function ApplianceBreakdown({
  appliances,
  roomRatePerKwh,
  title = 'Detected appliances',
}: {
  appliances: DetectedAppliance[];
  roomRatePerKwh: number;
  title?: string | null;
}) {
  if (appliances.length === 0) {
    return null;
  }

  return (
    <View style={styles.applianceGroup}>
      {title ? <Text style={styles.applianceGroupTitle}>{title}</Text> : null}
      {appliances.map((appliance) => (
        <View
          key={`${appliance.applianceTypeId}-${appliance.rank}`}
          style={styles.applianceItem}>
          <Text style={styles.itemTitle}>{appliance.applianceTypeName}</Text>
          <Text style={styles.helperText}>
            {appliance.categoryName} - {appliance.powerPattern}
          </Text>
          <Text style={styles.inlineStat}>
            {formatNumber(appliance.detectedPower, 'W')} - Real-time cost/hr{' '}
            {formatCurrency(getRealtimeCostPerHour(appliance.detectedPower, roomRatePerKwh))} -
            Confidence {formatConfidence(appliance.confidence)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricCardValue: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  metricValue: {
    color: theme.colors.primaryDark,
    fontSize: 30,
    fontWeight: '800',
  },
  heroMetric: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryInset: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.background,
    padding: 14,
    gap: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: 14,
    gap: 4,
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  applianceGroup: {
    gap: 8,
    paddingTop: 6,
  },
  applianceGroupTitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  applianceItem: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.background,
    padding: 12,
    gap: 2,
  },
  inlineStat: {
    color: theme.colors.text,
    lineHeight: 21,
  },
  statusText: {
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  online: {
    color: theme.colors.success,
  },
  offline: {
    color: theme.colors.danger,
  },
});

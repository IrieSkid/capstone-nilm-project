import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAuth } from '@/src/context/AuthContext';
import {
  AdminDashboardData,
  DetectedAppliance,
  DevicePort,
  TenantDashboardData,
} from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { runAfterBlur } from '@/src/utils/focus';
import {
  formatConfidence,
  formatCurrency,
  formatDateTime,
  formatNumber,
} from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [data, setData] = useState<AdminDashboardData | TenantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portActionError, setPortActionError] = useState<string | null>(null);
  const [activePortId, setActivePortId] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!token || !user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const nextData =
        user.roleName === 'admin'
          ? await apiRequest<AdminDashboardData>('/dashboard/admin', { token })
          : await apiRequest<TenantDashboardData>('/dashboard/tenant', { token });
      setData(nextData);
    } catch (dashboardError) {
      if (isUnauthorized(dashboardError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(dashboardError, 'Unable to load dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [logout, token, user]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
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

      setTimeout(() => {
        void loadDashboard();
      }, 2500);
    } catch (toggleError) {
      setPortActionError(getErrorMessage(toggleError, 'Unable to update the port state.'));
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
        <AdminDashboardView
          data={data as AdminDashboardData}
          onOpenDevices={() =>
            runAfterBlur(() => {
              router.replace('/(app)/devices');
            })
          }
          onOpenRooms={() =>
            runAfterBlur(() => {
              router.replace('/(app)/rooms');
            })
          }
          onOpenUsers={() =>
            runAfterBlur(() => {
              router.replace('/(app)/users');
            })
          }
          onRefresh={() => void loadDashboard()}
        />
      ) : null}

      {!loading && !error && user.roleName === 'tenant' && data ? (
        <TenantDashboardView
          data={data as TenantDashboardData}
          onRefresh={() => void loadDashboard()}
          onTogglePort={(portId, supplyState) => void handleTogglePort(portId, supplyState)}
          activePortId={activePortId}
          portActionError={portActionError}
        />
      ) : null}
    </ScreenShell>
  );
}

function AdminDashboardView({
  data,
  onRefresh,
  onOpenRooms,
  onOpenDevices,
  onOpenUsers,
}: {
  data: AdminDashboardData;
  onRefresh: () => void;
  onOpenRooms: () => void;
  onOpenDevices: () => void;
  onOpenUsers: () => void;
}) {
  return (
    <>
      <View style={styles.metricRow}>
        <MetricCard label="Rooms" value={String(data.totals.totalRooms)} />
        <MetricCard label="Devices" value={String(data.totals.totalDevices)} />
        <MetricCard label="Users" value={String(data.totals.totalUsers)} />
      </View>

      <SectionCard>
        <Text style={styles.sectionTitle}>Highest consuming room</Text>
        {data.highestConsumingRoom ? (
          <>
            <Text style={styles.heroMetric}>{data.highestConsumingRoom.roomName}</Text>
            <Text style={styles.helperText}>{data.highestConsumingRoom.tenantName}</Text>
            <Text style={styles.metricValue}>
              {formatNumber(data.highestConsumingRoom.currentPowerUsage, 'W')}
            </Text>
            <Text style={styles.helperText}>
              Estimated cost: {formatCurrency(data.highestConsumingRoom.estimatedCost)}
            </Text>
          </>
        ) : (
          <EmptyState
            description="No readings have been ingested yet."
            title="No highest consuming room yet"
          />
        )}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Quick links</Text>
        <View style={styles.buttonRow}>
          <Button label="Users" onPress={onOpenUsers} />
          <Button label="Rooms" onPress={onOpenRooms} variant="secondary" />
          <Button label="Devices" onPress={onOpenDevices} variant="ghost" />
        </View>
        <Button label="Refresh dashboard" onPress={onRefresh} variant="ghost" />
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Latest reading per room</Text>
        {data.roomSummaries.length === 0 ? (
          <EmptyState
            description="Create rooms and assign devices to see admin summaries."
            title="No rooms configured"
          />
        ) : (
          data.roomSummaries.map((room) => (
            <View key={room.roomId} style={styles.listItem}>
              <Text style={styles.itemTitle}>{room.roomName}</Text>
              <Text style={styles.helperText}>
                {room.tenantName} · {room.deviceIdentifier}
              </Text>
              <Text style={styles.inlineStat}>
                Power: {formatNumber(room.latestReading?.powerW, 'W')} · Cost:{' '}
                {formatCurrency(room.latestReading?.estimatedCost)}
              </Text>
              <Text style={styles.inlineStat}>
                Appliance: {room.latestDetection?.applianceTypeName || 'No confident match'} ·
                Confidence: {formatConfidence(room.latestDetection?.confidence)}
              </Text>
              <ApplianceBreakdown appliances={room.latestDetection?.appliances ?? []} />
              <Text style={styles.helperText}>
                Updated {formatDateTime(room.latestReading?.timestamp)}
              </Text>
            </View>
          ))
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
          </View>
        ))}
      </SectionCard>
    </>
  );
}

function TenantDashboardView({
  data,
  onRefresh,
  onTogglePort,
  activePortId,
  portActionError,
}: {
  data: TenantDashboardData;
  onRefresh: () => void;
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
        <Button label="Refresh dashboard" onPress={onRefresh} variant="ghost" />
      </SectionCard>
    );
  }

  return (
    <>
      {data.rooms.map((room) => (
        <SectionCard key={room.roomId}>
          <Text style={styles.sectionTitle}>{room.roomName}</Text>
          <Text style={styles.helperText}>
            {room.deviceName} · rate {formatCurrency(room.roomRatePerKwh)} / kWh
          </Text>
          <Text style={styles.metricValue}>{formatNumber(room.currentPowerUsage, 'W')}</Text>
          <Text style={styles.inlineStat}>
            Energy: {formatNumber(room.latestEnergyKwh, 'kWh')} · Cost:{' '}
            {formatCurrency(room.estimatedElectricityCost)}
          </Text>
          <Text style={styles.inlineStat}>
            Appliance: {room.likelyActiveAppliance || 'No confident match'} · Confidence:{' '}
            {formatConfidence(room.detectionConfidence)}
          </Text>
          <ApplianceBreakdown appliances={room.activeAppliances} />
          <Text style={styles.helperText}>Last reading {formatDateTime(room.latestReadingAt)}</Text>

          <Text style={styles.sectionTitle}>Remote port control</Text>
          {room.devicePorts.map((port) => {
            const detectedAppliance = room.activeAppliances.find(
              (appliance) => appliance.applianceTypeId === port.applianceTypeId,
            );

            return (
              <View key={port.devicePortId} style={styles.applianceItem}>
                <Text style={styles.itemTitle}>
                  {port.portLabel} · {port.applianceTypeName}
                </Text>
                <Text style={styles.helperText}>
                  Supply {port.supplyState.toUpperCase()} · {port.categoryName} · {port.powerPattern}
                </Text>
                <Text style={styles.inlineStat}>
                  {detectedAppliance
                    ? `${formatNumber(detectedAppliance.detectedPower, 'W')} · Confidence ${formatConfidence(detectedAppliance.confidence)}`
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
            room.recentHistory.map((reading) => (
              <View key={reading.readingId} style={styles.listItem}>
                <Text style={styles.itemTitle}>{formatDateTime(reading.timestamp)}</Text>
                <Text style={styles.inlineStat}>
                  {formatNumber(reading.powerW, 'W')} · {formatNumber(reading.energyKwh, 'kWh')}
                </Text>
                <Text style={styles.helperText}>
                  {reading.likelyActiveAppliance || 'No confident match'} · Cost{' '}
                  {formatCurrency(reading.estimatedCost)}
                </Text>
              </View>
            ))
          )}
        </SectionCard>
      ))}

      <Button label="Refresh dashboard" onPress={onRefresh} variant="ghost" />
    </>
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

function ApplianceBreakdown({ appliances }: { appliances: DetectedAppliance[] }) {
  if (appliances.length === 0) {
    return null;
  }

  return (
    <View style={styles.applianceGroup}>
      <Text style={styles.applianceGroupTitle}>Detected appliances</Text>
      {appliances.map((appliance) => (
        <View
          key={`${appliance.applianceTypeId}-${appliance.rank}`}
          style={styles.applianceItem}>
          <Text style={styles.itemTitle}>{appliance.applianceTypeName}</Text>
          <Text style={styles.helperText}>
            {appliance.categoryName} · {appliance.powerPattern}
          </Text>
          <Text style={styles.inlineStat}>
            {formatNumber(appliance.detectedPower, 'W')} · Confidence{' '}
            {formatConfidence(appliance.confidence)}
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

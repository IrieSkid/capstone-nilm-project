import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import {
  AdminDashboardData,
  DetectedAppliance,
  LandlordDashboardData,
  NotificationRecord,
  NotificationsData,
  TenantDashboardData,
} from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import {
  formatConfidence,
  formatCurrency,
  formatDateTime,
  formatDisplayLabel,
  formatDuration,
  formatNumber,
} from '@/src/utils/format';
import { hasModuleAccess } from '@/src/utils/access';
import { theme } from '@/src/utils/theme';

const DASHBOARD_REALTIME_INTERVAL_MS = 2000;

const MONTHLY_DAYS = 30;
const FALLBACK_DAILY_USAGE_HOURS = 8;
type AdminDashboardTab = 'overview' | 'rooms' | 'devices';
type TenantDashboardTab = 'overview' | 'controls' | 'history';
type TenantAlertType = 'device_offline' | 'threshold_alert' | 'overload_alert';

function normalizeTenantDashboardTab(value: string | string[] | undefined): TenantDashboardTab | null {
  const nextValue = Array.isArray(value) ? value[0] : value;

  if (nextValue === 'overview' || nextValue === 'controls' || nextValue === 'history') {
    return nextValue;
  }

  return null;
}

function normalizeTenantAlertType(value: string | string[] | undefined): TenantAlertType | null {
  const nextValue = Array.isArray(value) ? value[0] : value;

  if (
    nextValue === 'device_offline'
    || nextValue === 'threshold_alert'
    || nextValue === 'overload_alert'
  ) {
    return nextValue;
  }

  return null;
}

function resolveTenantAlertTarget(
  notification: NotificationRecord,
  data: TenantDashboardData | null,
) {
  const focus: TenantDashboardTab =
    notification.type === 'threshold_alert' || notification.type === 'overload_alert'
      ? 'controls'
      : 'overview';
  const alertType = normalizeTenantAlertType(notification.type) ?? null;

  if (!data) {
    return {
      roomId: null,
      focus,
      alertType,
    };
  }

  const matchedRoom =
    notification.referenceType === 'room' && notification.referenceId !== null
      ? data.rooms.find((room) => room.roomId === notification.referenceId)
      : notification.referenceType === 'device' && notification.referenceId !== null
        ? data.rooms.find((room) => room.deviceId === notification.referenceId)
        : null;

  return {
    roomId: matchedRoom?.roomId ?? null,
    focus,
    alertType,
  };
}

function buildTenantAlertPath(
  notification: NotificationRecord,
  data: TenantDashboardData | null,
) {
  const target = resolveTenantAlertTarget(notification, data);
  const fallbackPath = `/(app)/dashboard?focus=${target.focus}&alert=${notification.type}`;

  if (target.roomId === null) {
    return fallbackPath;
  }

  return `/(app)/dashboard?roomId=${target.roomId}&focus=${target.focus}&alert=${notification.type}`;
}

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
  const router = useRouter();
  const contentScrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const params = useLocalSearchParams<{
    roomId?: string | string[];
    focus?: string | string[];
    alert?: string | string[];
  }>();
  const [data, setData] = useState<
    AdminDashboardData | TenantDashboardData | LandlordDashboardData | null
  >(null);
  const [criticalAlerts, setCriticalAlerts] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portActionError, setPortActionError] = useState<string | null>(null);
  const [activePortId, setActivePortId] = useState<number | null>(null);
  const [tenantAlertFocus, setTenantAlertFocus] = useState<{
    roomId: number | null;
    tab: TenantDashboardTab | null;
    alertType: TenantAlertType | null;
    requestKey: number;
  }>({
    roomId: null,
    tab: null,
    alertType: null,
    requestKey: 0,
  });
  const requestInFlightRef = useRef(false);
  const highlightedRoomId = (() => {
    const roomIdValue = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const parsedRoomId = Number(roomIdValue);

    return Number.isFinite(parsedRoomId) && parsedRoomId > 0 ? parsedRoomId : null;
  })();
  const forcedTenantTab = normalizeTenantDashboardTab(params.focus);
  const highlightedTenantAlert = normalizeTenantAlertType(params.alert);
  const effectiveHighlightedRoomId = tenantAlertFocus.roomId ?? highlightedRoomId;
  const effectiveForcedTenantTab = tenantAlertFocus.tab ?? forcedTenantTab;
  const effectiveHighlightedTenantAlert = tenantAlertFocus.alertType ?? highlightedTenantAlert;

  const restoreScrollPosition = useCallback((targetY: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        contentScrollRef.current?.scrollTo({
          y: Math.max(0, targetY),
          animated: false,
        });
      });
    });
  }, []);

  const loadDashboard = useCallback(async (options?: {
    silent?: boolean;
    pullToRefresh?: boolean;
    preserveScroll?: boolean;
  }) => {
    if (!token || !user || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    const preservedScrollY = options?.preserveScroll ? scrollYRef.current : null;

    try {
      if (options?.pullToRefresh) {
        setRefreshing(true);
      } else if (!options?.silent) {
        setLoading(true);
      }

      const dashboardPromise =
        user.roleName === 'admin'
          ? apiRequest<AdminDashboardData>('/dashboard/admin', { token })
          : user.roleName === 'landlord'
            ? apiRequest<LandlordDashboardData>('/landlord/dashboard', { token })
            : apiRequest<TenantDashboardData>('/dashboard/tenant', { token });

      const [dashboardResult, notificationsResult] = await Promise.allSettled([
        dashboardPromise,
        apiRequest<NotificationsData>('/notifications', { token }),
      ]);

      if (dashboardResult.status === 'rejected') {
        throw dashboardResult.reason;
      }

      const nextData = dashboardResult.value;

      setData(nextData);
      setError(null);
      if (preservedScrollY !== null) {
        restoreScrollPosition(preservedScrollY);
      }

      if (notificationsResult.status === 'fulfilled') {
        const nextCriticalAlerts = notificationsResult.value.notifications
          .filter((notification) => notification.severity === 'critical')
          .sort((left, right) => {
            if (left.isRead !== right.isRead) {
              return left.isRead ? 1 : -1;
            }

            return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          })
          .slice(0, 3);

        setCriticalAlerts(nextCriticalAlerts);
      } else {
        if (isUnauthorized(notificationsResult.reason)) {
          await logout();
          return;
        }

        setCriticalAlerts([]);
      }
    } catch (dashboardError) {
      if (isUnauthorized(dashboardError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(dashboardError, 'Unable to load dashboard.'));
      setCriticalAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      requestInFlightRef.current = false;
    }
  }, [logout, restoreScrollPosition, token, user]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();

      const intervalId = setInterval(() => {
        void loadDashboard({ silent: true, preserveScroll: true });
      }, DASHBOARD_REALTIME_INTERVAL_MS);

      return () => {
        clearInterval(intervalId);
      };
    }, [loadDashboard]),
  );

  if (!user) {
    return null;
  }

  const canControlPorts =
    user.roleName === 'admin' || hasModuleAccess(user, 'port_control.use');
  const dashboardPermissionKey =
    user.roleName === 'landlord' ? 'landlord.dashboard.view' : 'dashboard.view';

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

      await loadDashboard({ silent: true, preserveScroll: true });
      showSuccess(
        supplyState === 'on' ? 'Port turned on' : 'Port turned off',
        `The selected device port is now ${supplyState.toUpperCase()} and the next reading cycle will reflect it.`,
      );

      setTimeout(() => {
        void loadDashboard({ silent: true, preserveScroll: true });
      }, 2500);
    } catch (toggleError) {
      const nextError = getErrorMessage(toggleError, 'Unable to update the port state.');
      setPortActionError(nextError);
      showError('Port update failed', nextError);
    } finally {
      setActivePortId(null);
    }
  }

  function handleOpenCriticalAlert(notification: NotificationRecord) {
    if (user?.roleName === 'tenant') {
      const target = resolveTenantAlertTarget(
        notification,
        data as TenantDashboardData | null,
      );

      setTenantAlertFocus((current) => ({
        roomId: target.roomId,
        tab: target.focus,
        alertType: target.alertType,
        requestKey: current.requestKey + 1,
      }));

      return;
    }

    const nextPath =
      notification.actionPath || '/notifications';

    if (nextPath.startsWith('/(app)/dashboard')) {
      router.replace(nextPath as never);
      return;
    }

    router.push(nextPath as never);
  }

  return (
    <RequireRole roles={['admin', 'tenant', 'landlord']} permissionKey={dashboardPermissionKey}>
      <ScreenShell
        contentScrollRef={contentScrollRef}
        onContentScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        onRefresh={() => void loadDashboard({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle={
          user.roleName === 'admin'
            ? 'Operational summary for rooms, devices, and the latest NILM detections.'
            : user.roleName === 'landlord'
              ? 'View owned rooms, tenants, devices, and billing estimates from one dashboard.'
            : 'Your current room usage, likely appliance, and estimated electricity cost.'
        }
        title={
          user.roleName === 'admin'
            ? 'Admin Dashboard'
            : user.roleName === 'landlord'
              ? 'Landlord Dashboard'
              : 'Tenant Dashboard'
        }>
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

        {!loading && !error && criticalAlerts.length > 0 ? (
          <SectionCard>
            <View style={styles.criticalAlertHeader}>
              <View style={styles.criticalAlertHeaderCopy}>
                <Text style={styles.criticalAlertTitle}>Critical alerts need attention</Text>
                <Text style={styles.helperText}>
                  These alerts override the normal dashboard flow until the underlying condition is resolved.
                </Text>
              </View>
              <View style={styles.criticalAlertCountPill}>
                <Text style={styles.criticalAlertCountLabel}>
                  {criticalAlerts.length} active
                </Text>
              </View>
            </View>

            <View style={styles.criticalAlertList}>
              {criticalAlerts.map((notification) => (
                <Pressable
                  key={notification.notificationId}
                  android_ripple={{ color: 'rgba(224,93,93,0.12)' }}
                  onPress={() => handleOpenCriticalAlert(notification)}
                  style={({ hovered, pressed }) => [
                    styles.criticalAlertCard,
                    (pressed || hovered) ? styles.criticalAlertCardActive : null,
                  ]}>
                  <Text style={styles.itemTitle}>{notification.title}</Text>
                  <Text style={styles.criticalAlertMessage}>{notification.message}</Text>
                  <Text style={styles.helperText}>
                    {formatDisplayLabel(notification.category)}
                    {notification.statementRoomName ? ` - ${notification.statementRoomName}` : ''}
                  </Text>
                  <Text style={styles.helperText}>
                    Received {formatDateTime(notification.createdAt)}
                  </Text>
                  <View style={styles.tapHintRow}>
                    <Text style={styles.tapHintText}>Tap to open related screen</Text>
                    <Text style={styles.tapHintArrow}>{'>'}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <Button
              label="Open notifications inbox"
              onPress={() => router.push('/notifications' as never)}
              variant="ghost"
            />
          </SectionCard>
        ) : null}

        {!loading && !error && user.roleName === 'admin' && data ? (
          <AdminDashboardView data={data as AdminDashboardData} />
        ) : null}

        {!loading && !error && user.roleName === 'landlord' && data ? (
          <LandlordDashboardView data={data as LandlordDashboardData} />
        ) : null}

        {!loading && !error && user.roleName === 'tenant' && data ? (
          <TenantDashboardView
            activePortId={activePortId}
            canControlPorts={canControlPorts}
            contentScrollRef={contentScrollRef}
            data={data as TenantDashboardData}
            focusRequestKey={tenantAlertFocus.requestKey}
            forcedActiveTab={effectiveForcedTenantTab}
            highlightedAlertType={effectiveHighlightedTenantAlert}
            highlightedRoomId={effectiveHighlightedRoomId}
            onTogglePort={(portId, supplyState) => void handleTogglePort(portId, supplyState)}
            portActionError={portActionError}
          />
        ) : null}
      </ScreenShell>
    </RequireRole>
  );
}

function AdminDashboardView({ data }: { data: AdminDashboardData }) {
  const [activeTab, setActiveTab] = useState<AdminDashboardTab>('overview');
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
  const onlineDevices = data.devices.filter((device) => device.computedStatus === 'online').length;
  const roomSnapshots = [...data.roomSummaries]
    .sort((left, right) => (right.latestReading?.powerW ?? 0) - (left.latestReading?.powerW ?? 0))
    .slice(0, 3);

  return (
    <>
      <View style={styles.metricGrid}>
        <MetricCard label="Rooms" value={String(data.totals.totalRooms)} />
        <MetricCard label="Devices" value={String(data.totals.totalDevices)} />
        <MetricCard label="Online devices" value={String(onlineDevices)} />
        <MetricCard label="Users" value={String(data.totals.totalUsers)} />
      </View>

      <OptionChips
        onSelect={(value) => setActiveTab(value)}
        options={[
          { label: 'Overview', value: 'overview' },
          { label: 'Rooms', value: 'rooms' },
          { label: 'Devices', value: 'devices' },
        ]}
        selectedValue={activeTab}
      />

      {activeTab === 'overview' ? (
        <>
          <SectionCard>
            <Text style={styles.sectionTitle}>Live total room consumption</Text>
            {data.roomSummaries.length > 0 ? (
              <>
                <Text style={styles.metricValue}>{formatNumber(totalConsumption, 'W')}</Text>
                <View style={styles.summaryGrid}>
                  <SummaryStat
                    label="Real-time cost/hr"
                    value={formatCurrency(totalRealtimeCostPerHour)}
                  />
                  <SummaryStat
                    label="Estimated monthly"
                    value={formatCurrency(totalEstimatedMonthlyCost)}
                  />
                  <SummaryStat label="Monitored rooms" value={String(roomsWithReadings)} />
                  <SummaryStat label="Offline devices" value={String(data.devices.length - onlineDevices)} />
                </View>
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
            <Text style={styles.sectionTitle}>Top room snapshots</Text>
            {roomSnapshots.length === 0 ? (
              <EmptyState
                description="Create rooms and assign devices to see live room activity."
                title="No room snapshots yet"
              />
            ) : (
              roomSnapshots.map((room, index) => {
                const estimatedMonthlyCost = getEstimatedMonthlyCost({
                  powerW: room.latestReading?.powerW,
                  roomRatePerKwh: room.roomRatePerKwh,
                  appliances: room.latestDetection?.appliances,
                });

                return (
                  <View
                    key={room.roomId}
                    style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
                    <Text style={styles.itemTitle}>{room.roomName}</Text>
                    <Text style={styles.helperText}>
                      {room.tenantName ?? 'Unassigned tenant'} -{' '}
                      {room.deviceIdentifier ?? 'Unassigned device'}
                    </Text>
                    <Text style={styles.inlineStat}>
                      {formatNumber(room.latestReading?.powerW, 'W')} -{' '}
                      {formatCurrency(
                        getRealtimeCostPerHour(
                          room.latestReading?.powerW,
                          room.roomRatePerKwh,
                        ),
                      )}{' '}
                      / hr
                    </Text>
                    <Text style={styles.helperText}>
                      Estimated monthly cost {formatCurrency(estimatedMonthlyCost)}
                    </Text>
                  </View>
                );
              })
            )}
          </SectionCard>
        </>
      ) : null}

      {activeTab === 'rooms' ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Latest reading per room</Text>
          {data.roomSummaries.length === 0 ? (
            <EmptyState
              description="Create rooms and assign devices to see admin summaries."
              title="No rooms configured"
            />
          ) : (
            data.roomSummaries.map((room, index) => {
              const estimatedMonthlyCost = getEstimatedMonthlyCost({
                powerW: room.latestReading?.powerW,
                roomRatePerKwh: room.roomRatePerKwh,
                appliances: room.latestDetection?.appliances,
              });

              return (
                <View
                  key={room.roomId}
                  style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
                  <Text style={styles.itemTitle}>{room.roomName}</Text>
                  <Text style={styles.helperText}>
                    {room.tenantName ?? 'Unassigned tenant'} -{' '}
                    {room.deviceIdentifier ?? 'Unassigned device'}
                  </Text>
                  <View style={styles.summaryGrid}>
                    <SummaryStat
                      label="Power"
                      value={formatNumber(room.latestReading?.powerW, 'W')}
                    />
                    <SummaryStat
                      label="Monthly estimate"
                      value={formatCurrency(estimatedMonthlyCost)}
                    />
                    <SummaryStat
                      label="Device uptime"
                      value={
                        room.deviceUptimeSeconds !== null
                          ? formatDuration(room.deviceUptimeSeconds)
                          : 'Offline'
                      }
                    />
                    <SummaryStat
                      label="Top appliance"
                      value={room.latestDetection?.applianceTypeName || 'No match'}
                    />
                  </View>
                  <Text style={styles.helperText}>
                    Confidence {formatConfidence(room.latestDetection?.confidence)} - Updated{' '}
                    {formatDateTime(room.latestReading?.timestamp)}
                  </Text>
                  <ApplianceBreakdown
                    appliances={room.latestDetection?.appliances ?? []}
                    roomRatePerKwh={room.roomRatePerKwh}
                  />
                </View>
              );
            })
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'devices' ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Device status</Text>
          {data.devices.map((device, index) => (
            <View
              key={device.deviceId}
              style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
              <Text style={styles.itemTitle}>{device.deviceName}</Text>
              <Text style={styles.helperText}>{device.deviceIdentifier}</Text>
              <View style={styles.statusRow}>
                <Text
                  style={[
                    styles.statusText,
                    device.computedStatus === 'online' ? styles.online : styles.offline,
                  ]}>
                  {device.computedStatus.toUpperCase()}
                </Text>
                <Text style={styles.helperText}>
                  Uptime:{' '}
                  {device.deviceUptimeSeconds !== null
                    ? formatDuration(device.deviceUptimeSeconds)
                    : 'Offline'}
                </Text>
              </View>
              <Text style={styles.helperText}>
                Last seen {formatDateTime(device.deviceLastSeen)}
              </Text>
            </View>
          ))}
        </SectionCard>
      ) : null}
    </>
  );
}

function LandlordDashboardView({ data }: { data: LandlordDashboardData }) {
  const router = useRouter();
  const { showError, showSuccess } = useAppAlert();

  async function handleCopyInviteCode(code: string) {
    try {
      await Clipboard.setStringAsync(code);
      showSuccess('Invite code copied', 'Your landlord invite code was copied to the clipboard.');
    } catch {
      showError('Copy failed', 'Unable to copy the invite code right now.');
    }
  }

  return (
    <>
      <View style={styles.metricGrid}>
        <MetricCard label="Owned rooms" value={String(data.summary.totalOwnedRooms)} />
        <MetricCard label="Occupied" value={String(data.summary.occupiedRooms)} />
        <MetricCard label="Vacant" value={String(data.summary.vacantRooms)} />
        <MetricCard label="Pending approvals" value={String(data.summary.pendingTenantRequests)} />
        <MetricCard label="Offline devices" value={String(data.summary.offlineDevices)} />
      </View>

      <SectionCard>
        <Text style={styles.sectionTitle}>Tenant invite code</Text>
        <Text style={styles.helperText}>
          Share this code with new tenants during registration. They will stay pending until you approve them.
        </Text>
        <Text style={styles.metricValue}>{data.landlordRegistrationCode ?? 'No invite code yet'}</Text>
        {data.landlordRegistrationCode ? (
          <Pressable
            android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
            onPress={() => void handleCopyInviteCode(data.landlordRegistrationCode as string)}
            style={({ hovered, pressed }) => [
              styles.copyButton,
              (pressed || hovered) ? styles.copyButtonActive : null,
            ]}>
            <MaterialIcons color={theme.colors.primary} name="content-copy" size={16} />
            <Text style={styles.copyButtonLabel}>Copy code</Text>
          </Pressable>
        ) : null}
        <View style={styles.summaryGrid}>
          <SummaryStat
            label="Pending approvals"
            value={String(data.summary.pendingTenantRequests)}
          />
          <SummaryStat
            label="Active tenants"
            value={String(data.summary.totalTenants)}
          />
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Owned room overview</Text>
        {data.roomSnapshots.length > 0 ? (
          <>
            <View style={styles.summaryGrid}>
              <SummaryStat
                label="Real-time cost/hr"
                value={formatCurrency(data.summary.totalRealtimeCostPerHour)}
              />
              <SummaryStat
                label="Estimated monthly"
                value={formatCurrency(data.summary.totalEstimatedMonthlyCost)}
              />
              <SummaryStat label="Active tenants" value={String(data.summary.totalTenants)} />
              <SummaryStat
                label="Billable rooms"
                value={String(
                  data.roomSnapshots.filter((room) => room.latestReading || room.tenantId !== null).length,
                )}
              />
            </View>
            {data.highestConsumingRoom ? (
              <Pressable
                onPress={() => router.push(`/landlord-room-detail?roomId=${data.highestConsumingRoom?.roomId}`)}
                android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
                style={({ hovered, pressed }) => [
                  styles.summaryInset,
                  styles.cardPressable,
                  (pressed || hovered) ? styles.cardPressableActive : null,
                ]}>
                <Text style={styles.applianceGroupTitle}>Highest consuming room</Text>
                <Text style={styles.heroMetric}>{data.highestConsumingRoom.roomName}</Text>
                <Text style={styles.helperText}>
                  {data.highestConsumingRoom.tenantName ?? 'No tenant assigned'}
                </Text>
                <Text style={styles.inlineStat}>
                  Power: {formatNumber(data.highestConsumingRoom.currentPowerUsage, 'W')}
                </Text>
                <Text style={styles.helperText}>
                  Estimated monthly cost:{' '}
                  {formatCurrency(data.highestConsumingRoom.estimatedMonthlyCost)}
                </Text>
                <View style={styles.tapHintRow}>
                  <Text style={styles.tapHintText}>Tap card to open room details</Text>
                  <Text style={styles.tapHintArrow}>{'>'}</Text>
                </View>
              </Pressable>
            ) : null}
          </>
        ) : (
          <EmptyState
            description="Assign yourself as landlord to rooms in Room Management to start monitoring them here."
            title="No owned rooms yet"
          />
        )}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Latest owned room snapshots</Text>
        {data.roomSnapshots.length === 0 ? (
          <EmptyState
            description="Once rooms are assigned to this landlord, their latest readings and tenants will appear here."
            title="No room snapshots yet"
          />
        ) : (
          data.roomSnapshots.map((room, index) => {
            const estimatedMonthlyCost = getEstimatedMonthlyCost({
              powerW: room.latestReading?.powerW,
              roomRatePerKwh: room.roomRatePerKwh,
              appliances: room.latestDetection?.appliances ?? null,
            });

            return (
              <Pressable
                onPress={() => router.push(`/landlord-room-detail?roomId=${room.roomId}`)}
                key={room.roomId}
                android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
                style={({ hovered, pressed }) => [
                  styles.listItem,
                  styles.cardPressable,
                  index === 0 ? styles.listItemFirst : null,
                  (pressed || hovered) ? styles.cardPressableActive : null,
                ]}>
                <Text style={styles.itemTitle}>{room.roomName}</Text>
                <Text style={styles.helperText}>
                  {room.tenantName ?? 'No tenant assigned'} -{' '}
                  {room.deviceIdentifier ?? 'No device assigned'}
                </Text>
                <View style={styles.summaryGrid}>
                  <SummaryStat
                    label="Power"
                    value={formatNumber(room.latestReading?.powerW, 'W')}
                  />
                  <SummaryStat
                    label="Monthly estimate"
                    value={formatCurrency(estimatedMonthlyCost)}
                  />
                  <SummaryStat
                    label="Device uptime"
                    value={
                      room.deviceUptimeSeconds !== null
                        ? formatDuration(room.deviceUptimeSeconds)
                        : 'Offline'
                    }
                  />
                  <SummaryStat
                    label="Top appliance"
                    value={room.latestDetection?.applianceTypeName || 'No match'}
                  />
                </View>
                <Text style={styles.helperText}>
                  Updated {formatDateTime(room.latestReading?.timestamp)}
                </Text>
                <View style={styles.tapHintRow}>
                  <Text style={styles.tapHintText}>Tap card to open room details</Text>
                  <Text style={styles.tapHintArrow}>{'>'}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </SectionCard>
    </>
  );
}

function TenantDashboardView({
  data,
  onTogglePort,
  activePortId,
  portActionError,
  canControlPorts,
  contentScrollRef,
  highlightedRoomId,
  forcedActiveTab,
  highlightedAlertType,
  focusRequestKey,
}: {
  data: TenantDashboardData;
  onTogglePort: (portId: number, supplyState: 'on' | 'off') => void;
  activePortId: number | null;
  portActionError: string | null;
  canControlPorts: boolean;
  contentScrollRef: RefObject<ScrollView | null>;
  highlightedRoomId: number | null;
  forcedActiveTab: TenantDashboardTab | null;
  highlightedAlertType: TenantAlertType | null;
  focusRequestKey: number;
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

  const orderedRooms = [...data.rooms].sort((left, right) => {
    if (highlightedRoomId === null) {
      return 0;
    }

    if (left.roomId === highlightedRoomId) {
      return -1;
    }

    if (right.roomId === highlightedRoomId) {
      return 1;
    }

    return 0;
  });

  return (
    <>
      {orderedRooms.map((room) => {
        return (
          <TenantRoomCard
            key={room.roomId}
            activePortId={activePortId}
            canControlPorts={canControlPorts}
            contentScrollRef={contentScrollRef}
            focusRequestKey={room.roomId === highlightedRoomId ? focusRequestKey : 0}
            forcedActiveTab={room.roomId === highlightedRoomId ? forcedActiveTab : null}
            highlightedAlertType={room.roomId === highlightedRoomId ? highlightedAlertType : null}
            onTogglePort={onTogglePort}
            portActionError={portActionError}
            room={room}
          />
        );
      })}
    </>
  );
}

function TenantRoomCard({
  room,
  onTogglePort,
  activePortId,
  portActionError,
  canControlPorts,
  contentScrollRef,
  forcedActiveTab,
  highlightedAlertType,
  focusRequestKey,
}: {
  room: TenantDashboardData['rooms'][number];
  onTogglePort: (portId: number, supplyState: 'on' | 'off') => void;
  activePortId: number | null;
  portActionError: string | null;
  canControlPorts: boolean;
  contentScrollRef: RefObject<ScrollView | null>;
  forcedActiveTab: TenantDashboardTab | null;
  highlightedAlertType: TenantAlertType | null;
  focusRequestKey: number;
}) {
  const [activeTab, setActiveTab] = useState<TenantDashboardTab>('overview');
  const [cardTopY, setCardTopY] = useState<number | null>(null);
  const [controlsTopY, setControlsTopY] = useState<number | null>(null);
  const [pendingScrollToControls, setPendingScrollToControls] = useState(false);
  const estimatedMonthlyCost = getEstimatedMonthlyCost({
    powerW: room.currentPowerUsage,
    roomRatePerKwh: room.roomRatePerKwh,
    appliances: room.activeAppliances,
  });
  const realtimeCostPerHour = getRealtimeCostPerHour(
    room.currentPowerUsage,
    room.roomRatePerKwh,
  );
  const orderedDevicePorts = [...room.devicePorts].sort((left, right) => {
    if (left.supplyState !== right.supplyState) {
      return left.supplyState === 'on' ? -1 : 1;
    }

    return left.portLabel.localeCompare(right.portLabel, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  useEffect(() => {
    if (forcedActiveTab) {
      setActiveTab(forcedActiveTab);
    }
  }, [focusRequestKey, forcedActiveTab]);

  useEffect(() => {
    if (
      forcedActiveTab === 'controls'
      && (highlightedAlertType === 'threshold_alert' || highlightedAlertType === 'overload_alert')
    ) {
      setPendingScrollToControls(true);
    }
  }, [focusRequestKey, forcedActiveTab, highlightedAlertType]);

  useEffect(() => {
    if (
      !pendingScrollToControls
      || activeTab !== 'controls'
      || cardTopY === null
      || controlsTopY === null
    ) {
      return;
    }

    const nextScrollY = Math.max(0, cardTopY + controlsTopY - 18);

    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ y: nextScrollY, animated: true });
      setPendingScrollToControls(false);
    });
  }, [activeTab, cardTopY, contentScrollRef, controlsTopY, pendingScrollToControls]);

  return (
    <View onLayout={(event) => setCardTopY(event.nativeEvent.layout.y)}>
      <SectionCard>
        <Text style={styles.sectionTitle}>{room.roomName}</Text>
        <Text style={styles.helperText}>
          {room.deviceName} - rate {formatCurrency(room.roomRatePerKwh)} / kWh
        </Text>
        <Text style={styles.helperText}>
          Landlord: {room.landlordName ?? 'No landlord assigned'}
        </Text>
        <Text style={styles.metricValue}>{formatNumber(room.currentPowerUsage, 'W')}</Text>
        <View style={styles.summaryGrid}>
          <SummaryStat label="Real-time cost/hr" value={formatCurrency(realtimeCostPerHour)} />
          <SummaryStat label="Estimated monthly" value={formatCurrency(estimatedMonthlyCost)} />
          <SummaryStat label="Energy" value={formatNumber(room.latestEnergyKwh, 'kWh')} />
          <SummaryStat
            label="Device uptime"
            value={
              room.deviceUptimeSeconds !== null
                ? formatDuration(room.deviceUptimeSeconds)
                : 'Offline'
            }
          />
        </View>
        <Text style={styles.inlineStat}>
          Likely appliance: {room.likelyActiveAppliance || 'No confident match'} - Confidence{' '}
          {formatConfidence(room.detectionConfidence)}
        </Text>
        <Text style={styles.helperText}>Last reading {formatDateTime(room.latestReadingAt)}</Text>

          <OptionChips
            onSelect={(value) => setActiveTab(value)}
            options={[
              { label: 'Overview', value: 'overview' },
              { label: 'Controls', value: 'controls' },
            { label: 'History', value: 'history' },
          ]}
          selectedValue={activeTab}
        />

        {activeTab === 'overview' ? (
          room.activeAppliances.length > 0 ? (
            <ApplianceBreakdown
              appliances={room.activeAppliances}
              roomRatePerKwh={room.roomRatePerKwh}
            />
          ) : (
            <EmptyState
              description="No appliances are confidently active in the latest reading."
              title="No active appliances detected"
            />
          )
        ) : null}

        {activeTab === 'controls' ? (
          <View onLayout={(event) => setControlsTopY(event.nativeEvent.layout.y)}>
            {canControlPorts ? (
              <>
                <Text style={styles.sectionTitle}>Remote port control</Text>
                {orderedDevicePorts.map((port) => {
                  const detectedAppliance = room.activeAppliances.find(
                    (appliance) => appliance.applianceTypeId === port.applianceTypeId,
                  );

                  return (
                    <View
                      key={port.devicePortId}
                      style={[
                        styles.applianceItem,
                        styles.portControlCard,
                        port.supplyState === 'off'
                          ? styles.portControlCardOff
                          : styles.portControlCardOn,
                      ]}>
                      <Text style={styles.itemTitle}>
                        {port.portLabel} - {port.applianceTypeName}
                      </Text>
                      <Text style={styles.helperText}>
                        Supply {formatDisplayLabel(port.supplyState)} - {port.categoryName} -{' '}
                        {formatDisplayLabel(port.powerPattern)}
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
                      <View style={styles.switchRow}>
                        <View style={styles.switchMeta}>
                          <Text style={styles.switchLabel}>Supply state</Text>
                          <Text style={styles.helperText}>
                            {port.supplyState === 'on' ? 'Currently on' : 'Currently off'}
                          </Text>
                        </View>
                        {activePortId === port.devicePortId ? (
                          <ActivityIndicator color={theme.colors.primary} />
                        ) : (
                          <Switch
                            disabled={activePortId === port.devicePortId}
                            ios_backgroundColor={theme.colors.danger}
                            onValueChange={(nextValue) =>
                              onTogglePort(port.devicePortId, nextValue ? 'on' : 'off')
                            }
                            thumbColor={theme.colors.white}
                            trackColor={{
                              false: theme.colors.danger,
                              true: theme.colors.primary,
                            }}
                            value={port.supplyState === 'on'}
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
                {portActionError ? <Text style={styles.errorText}>{portActionError}</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Remote port control</Text>
                <Text style={styles.helperText}>
                  Remote port control is currently disabled for your role by the administrator.
                </Text>
              </>
            )}
          </View>
        ) : null}

        {activeTab === 'history' ? (
          <>
            <Text style={styles.sectionTitle}>Recent reading history</Text>
            {room.recentHistory.length === 0 ? (
              <EmptyState
                description="Once the feeder or device sends data, readings will appear here."
                title="No readings yet"
              />
            ) : (
              room.recentHistory.map((reading, index) => {
                const readingMonthlyEstimate = getEstimatedMonthlyCost({
                  powerW: reading.powerW,
                  roomRatePerKwh: room.roomRatePerKwh,
                  appliances: reading.detections,
                });

                return (
                  <View
                    key={reading.readingId}
                    style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
                    <Text style={styles.itemTitle}>{formatDateTime(reading.timestamp)}</Text>
                    <Text style={styles.inlineStat}>
                      {formatNumber(reading.powerW, 'W')} - {formatNumber(reading.energyKwh, 'kWh')}
                    </Text>
                    <Text style={styles.helperText}>
                      {reading.detections.length > 0
                        ? reading.detections.map((appliance) => appliance.applianceTypeName).join(' + ')
                        : reading.likelyActiveAppliance || 'No confident match'} - Estimated monthly
                      cost {formatCurrency(readingMonthlyEstimate)}
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
          </>
        ) : null}
      </SectionCard>
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatLabel}>{label}</Text>
      <Text style={styles.summaryStatValue}>{value}</Text>
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
          {appliance.portLabel || appliance.applianceUptimeSeconds !== undefined ? (
            <Text style={styles.helperText}>
              {appliance.portLabel ? `${appliance.portLabel}` : 'Unmapped port'}
              {appliance.applianceUptimeSeconds !== null
                && appliance.applianceUptimeSeconds !== undefined
                ? ` - Uptime ${formatDuration(appliance.applianceUptimeSeconds)}`
                : ''}
            </Text>
          ) : null}
          <Text style={styles.helperText}>
            {appliance.categoryName} - {formatDisplayLabel(appliance.powerPattern)}
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
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
  copyButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(79,163,181,0.32)',
    backgroundColor: 'rgba(79,163,181,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  copyButtonActive: {
    backgroundColor: 'rgba(79,163,181,0.14)',
    borderColor: 'rgba(79,163,181,0.42)',
  },
  copyButtonLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  heroMetric: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryInset: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  cardPressable: {
    overflow: 'hidden',
    borderRadius: theme.radius.sm,
  },
  cardPressableActive: {
    backgroundColor: 'rgba(79,163,181,0.04)',
    borderColor: 'rgba(79,163,181,0.18)',
    borderWidth: 1,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  tapHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(79,163,181,0.24)',
    paddingTop: 10,
    marginTop: 4,
  },
  tapHintText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  tapHintArrow: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryStat: {
    flexGrow: 1,
    flexBasis: 145,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.background,
    padding: 12,
    gap: 4,
  },
  summaryStatLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    color: theme.colors.text,
    fontSize: 16,
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
  criticalAlertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  criticalAlertHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  criticalAlertTitle: {
    color: theme.colors.danger,
    fontSize: 20,
    fontWeight: '800',
  },
  criticalAlertCountPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(224, 93, 93, 0.5)',
    backgroundColor: 'rgba(224, 93, 93, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  criticalAlertCountLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  criticalAlertList: {
    gap: 10,
  },
  criticalAlertCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(224, 93, 93, 0.42)',
    backgroundColor: 'rgba(224, 93, 93, 0.1)',
    padding: 14,
    gap: 6,
    overflow: 'hidden',
  },
  criticalAlertCardActive: {
    backgroundColor: 'rgba(224, 93, 93, 0.16)',
    borderColor: 'rgba(224, 93, 93, 0.58)',
  },
  criticalAlertMessage: {
    color: theme.colors.text,
    lineHeight: 21,
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  switchMeta: {
    flex: 1,
    minWidth: 150,
    gap: 2,
  },
  switchLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listItem: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  listItemFirst: {
    borderWidth: 1,
    paddingTop: 14,
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  applianceGroup: {
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    marginTop: 4,
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
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.background,
    padding: 12,
    gap: 4,
  },
  portControlCard: {
    gap: 6,
  },
  portControlCardOn: {
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.background,
  },
  portControlCardOff: {
    borderColor: 'rgba(224, 93, 93, 0.42)',
    backgroundColor: 'rgba(224, 93, 93, 0.08)',
  },
  inlineStat: {
    color: theme.colors.text,
    lineHeight: 21,
  },
  statusText: {
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  online: {
    color: theme.colors.success,
  },
  offline: {
    color: theme.colors.danger,
  },
});

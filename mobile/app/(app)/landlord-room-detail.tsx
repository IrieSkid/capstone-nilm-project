import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { SelectField } from '@/src/components/SelectField';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import {
  LandlordRoomManagementOptions,
  NotificationRecord,
  NotificationsData,
  LandlordRoomSnapshot,
} from '@/src/types/models';
import { hasModuleAccess } from '@/src/utils/access';
import { getErrorMessage, getFieldErrors, isUnauthorized } from '@/src/utils/errors';
import {
  formatConfidence,
  formatCurrency,
  formatDateTime,
  formatDisplayLabel,
  formatDuration,
  formatNumber,
} from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const UNASSIGNED_OPTION = 'unassigned';
const DEFAULT_WARNING_POWER_W = 1200;
const DEFAULT_OVERLOAD_POWER_W = 1800;

const initialForm = {
  room_tenant_id: null as number | null,
  room_device_id: null as number | null,
  room_rate_per_kwh: '12.00',
  room_status: 'available' as 'available' | 'occupied',
};

const initialAlertForm = {
  warning_power_w: '1200',
  overload_power_w: '1800',
  notify_tenant: true,
  notify_landlord: true,
  notify_admin: true,
};

type LandlordRoomFieldErrors = Partial<
  Record<'room_tenant_id' | 'room_device_id' | 'room_rate_per_kwh' | 'room_status', string>
>;

type LandlordRoomAlertFieldErrors = Partial<
  Record<'warning_power_w' | 'overload_power_w', string>
>;

function getRoomIdParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function getRealtimeCostPerHour(powerW: number | null | undefined, roomRatePerKwh: number) {
  if (powerW === null || powerW === undefined) {
    return null;
  }

  return Number((((powerW / 1000) * roomRatePerKwh)).toFixed(2));
}

function getEffectiveAlertSettings(room: LandlordRoomSnapshot | null) {
  return {
    warningPowerW: room?.alertSettings?.warningPowerW ?? DEFAULT_WARNING_POWER_W,
    overloadPowerW: room?.alertSettings?.overloadPowerW ?? DEFAULT_OVERLOAD_POWER_W,
    notifyTenant: room?.alertSettings?.notifyTenant ?? true,
    notifyLandlord: room?.alertSettings?.notifyLandlord ?? true,
    notifyAdmin: room?.alertSettings?.notifyAdmin ?? true,
  };
}

function getRoomIdFromNotification(notification: NotificationRecord) {
  if (notification.referenceType === 'room' && notification.referenceId) {
    return notification.referenceId;
  }

  if (!notification.actionPath) {
    return null;
  }

  const roomIdMatch = notification.actionPath.match(/roomId=(\d+)/);
  return roomIdMatch ? Number(roomIdMatch[1]) : null;
}

export default function LandlordRoomDetailScreen() {
  const { roomId: roomIdParam } = useLocalSearchParams<{ roomId?: string | string[] }>();
  const roomId = getRoomIdParam(roomIdParam);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { showError, showSuccess } = useAppAlert();
  const { token, logout, user } = useAuth();
  const [room, setRoom] = useState<LandlordRoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState<NotificationRecord[]>([]);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<LandlordRoomFieldErrors>({});
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [savingAlertSettings, setSavingAlertSettings] = useState(false);
  const [alertForm, setAlertForm] = useState(initialAlertForm);
  const [alertFieldErrors, setAlertFieldErrors] = useState<LandlordRoomAlertFieldErrors>({});
  const [alertError, setAlertError] = useState<string | null>(null);
  const [isChecklistCollapsed, setIsChecklistCollapsed] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState<LandlordRoomManagementOptions>({
    tenants: [],
    devices: [],
  });

  const canUpdateRoomDetails = Boolean(user && hasModuleAccess(user, 'landlord.rooms.update'));
  const canAssignTenant = Boolean(user && hasModuleAccess(user, 'landlord.tenants.assign'));
  const canAssignDevice = Boolean(user && hasModuleAccess(user, 'landlord.devices.assign'));
  const canManageAlerts = canUpdateRoomDetails;
  const canManageRoom = canUpdateRoomDetails || canAssignTenant || canAssignDevice;
  const isCompactLayout = width < 430;
  const effectiveAlertSettings = useMemo(() => getEffectiveAlertSettings(room), [room]);

  const loadRoom = useCallback(async (options?: { pullToRefresh?: boolean }) => {
    if (!token || !roomId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (options?.pullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      const [roomResult, notificationsResult] = await Promise.allSettled([
        apiRequest<LandlordRoomSnapshot>(`/landlord/rooms/${roomId}`, { token }),
        apiRequest<NotificationsData>('/notifications', { token }),
      ]);

      if (roomResult.status === 'rejected') {
        throw roomResult.reason;
      }

      const nextRoom = roomResult.value;
      setRoom(nextRoom);

      if (notificationsResult.status === 'fulfilled') {
        const nextCriticalAlerts = notificationsResult.value.notifications
          .filter((notification) => notification.severity === 'critical')
          .filter((notification) => getRoomIdFromNotification(notification) === nextRoom.roomId)
          .sort((left, right) => {
            if (left.isRead !== right.isRead) {
              return left.isRead ? 1 : -1;
            }

            return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          });

        setCriticalAlerts(nextCriticalAlerts);
      } else {
        setCriticalAlerts([]);
      }
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load this room.'));
      setCriticalAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, roomId, token]);

  useFocusEffect(
    useCallback(() => {
      void loadRoom();
    }, [loadRoom]),
  );

  const tenantOptions = useMemo<Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }>>(
    () => [
      { label: 'Unassigned tenant', value: UNASSIGNED_OPTION },
      ...assignmentOptions.tenants.map((tenant) => ({
        label:
          tenant.assignedRoomName && room && tenant.assignedRoomId === room.roomId
            ? `${tenant.userName} (current)`
            : tenant.userName,
        value: tenant.userId,
      })),
    ],
    [assignmentOptions.tenants, room],
  );

  const deviceOptions = useMemo<Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }>>(
    () => [
      { label: 'Unassigned device', value: UNASSIGNED_OPTION },
      ...assignmentOptions.devices.map((device) => ({
        label:
          device.assignedRoomName && room && device.assignedRoomId === room.roomId
            ? `${device.deviceIdentifier} (current)`
            : `${device.deviceIdentifier} - ${device.deviceName}`,
        value: device.deviceId,
      })),
    ],
    [assignmentOptions.devices, room],
  );

  const summaryItems = useMemo(() => {
    if (!room) {
      return [];
    }

    return [
      { label: 'Current power', value: formatNumber(room.latestReading?.powerW, 'W') },
      {
        label: 'Cost per hour',
        value: formatCurrency(getRealtimeCostPerHour(room.latestReading?.powerW, room.roomRatePerKwh)),
      },
      { label: 'Monthly estimate', value: formatCurrency(room.estimatedMonthlyCost) },
      {
        label: 'Device uptime',
        value: room.deviceUptimeSeconds !== null ? formatDuration(room.deviceUptimeSeconds) : 'Offline',
      },
    ];
  }, [room]);

  const currentAlertState = useMemo(() => {
    if (!room?.latestReading?.powerW) {
      return {
        title: 'Waiting for live usage',
        description: 'Threshold alerts will trigger after fresh readings arrive for this room.',
      };
    }

    const currentPower = room.latestReading.powerW;

    if (currentPower >= effectiveAlertSettings.overloadPowerW) {
      return {
        title: 'Overload level reached',
        description: `${formatNumber(currentPower, 'W')} is already above the overload threshold.`,
      };
    }

    if (currentPower >= effectiveAlertSettings.warningPowerW) {
      return {
        title: 'Warning threshold reached',
        description: `${formatNumber(currentPower, 'W')} is currently above the room warning threshold.`,
      };
    }

    return {
      title: 'Usage is below threshold',
      description: `${formatNumber(currentPower, 'W')} is still within the room’s configured safe range.`,
    };
  }, [effectiveAlertSettings.overloadPowerW, effectiveAlertSettings.warningPowerW, room]);

  const alertRecipientSummary = useMemo(() => {
    if (!room) {
      return 'No recipients configured';
    }

    const recipients = [];

    if (effectiveAlertSettings.notifyTenant) {
      recipients.push('Tenant');
    }

    if (effectiveAlertSettings.notifyLandlord) {
      recipients.push('Landlord');
    }

    if (effectiveAlertSettings.notifyAdmin) {
      recipients.push('Admin');
    }

    return recipients.length ? recipients.join(', ') : 'No recipients enabled';
  }, [effectiveAlertSettings.notifyAdmin, effectiveAlertSettings.notifyLandlord, effectiveAlertSettings.notifyTenant, room]);

  const setupChecklist = useMemo(() => {
    if (!room) {
      return [];
    }

    return [
      {
        label: 'Room is under your ownership',
        description: 'This room is already scoped to your landlord account.',
        complete: true,
      },
      {
        label: 'Tenant assigned',
        description: room.tenantName ?? 'Assign a tenant when the room is occupied.',
        complete: Boolean(room.tenantId),
      },
      {
        label: 'Device assigned',
        description: room.deviceIdentifier ?? 'Attach a monitoring device when ready.',
        complete: Boolean(room.deviceId),
      },
      {
        label: 'First reading received',
        description: room.latestReading?.timestamp
          ? `Latest reading ${formatDateTime(room.latestReading.timestamp)}`
          : 'No live reading has been received yet.',
        complete: Boolean(room.latestReading),
      },
      {
        label: 'Appliance ports configured',
        description:
          room.devicePorts.length > 0
            ? `${room.devicePorts.length} configured port(s) detected.`
            : 'No appliance ports have been configured yet for this room.',
        complete: room.devicePorts.length > 0,
      },
    ];
  }, [room]);

  const isChecklistComplete = setupChecklist.length > 0 && setupChecklist.every((item) => item.complete);

  useEffect(() => {
    setIsChecklistCollapsed(isChecklistComplete);
  }, [isChecklistComplete, room?.roomId]);

  async function handleOpenEmail(email: string) {
    try {
      await Linking.openURL(`mailto:${email}`);
    } catch {
      showError('Unable to open email', 'No email app is available for this action right now.');
    }
  }

  async function handleOpenPhone(phone: string) {
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      showError('Unable to open phone', 'No calling app is available for this action right now.');
    }
  }

  async function openManageModal() {
    if (!room) {
      return;
    }

    setForm({
      room_tenant_id: room.tenantId,
      room_device_id: room.deviceId,
      room_rate_per_kwh: String(room.roomRatePerKwh),
      room_status: room.roomStatus,
    });
    setFieldErrors({});
    setError(null);
    setAssignmentOptions({ tenants: [], devices: [] });
    setIsFormModalVisible(true);

    if (!token || (!canAssignTenant && !canAssignDevice)) {
      return;
    }

    try {
      setOptionsLoading(true);
      const nextOptions = await apiRequest<LandlordRoomManagementOptions>(
        `/landlord/rooms/${room.roomId}/options`,
        { token },
      );
      setAssignmentOptions(nextOptions);
    } catch (loadError) {
      const nextError = getErrorMessage(loadError, 'Unable to load tenant and device options.');
      setError(nextError);
      showError('Unable to load room options', nextError);
    } finally {
      setOptionsLoading(false);
    }
  }

  function closeManageModal() {
    setForm(initialForm);
    setFieldErrors({});
    setAssignmentOptions({ tenants: [], devices: [] });
    setIsFormModalVisible(false);
    setError(null);
  }

  function openAlertSettingsModal() {
    if (!room) {
      return;
    }

    setAlertFieldErrors({});
    setAlertError(null);
    setAlertForm({
      warning_power_w: String(effectiveAlertSettings.warningPowerW),
      overload_power_w: String(effectiveAlertSettings.overloadPowerW),
      notify_tenant: effectiveAlertSettings.notifyTenant,
      notify_landlord: effectiveAlertSettings.notifyLandlord,
      notify_admin: effectiveAlertSettings.notifyAdmin,
    });
    setIsAlertModalVisible(true);
  }

  function closeAlertSettingsModal() {
    if (room) {
      setAlertForm({
        warning_power_w: String(effectiveAlertSettings.warningPowerW),
        overload_power_w: String(effectiveAlertSettings.overloadPowerW),
        notify_tenant: effectiveAlertSettings.notifyTenant,
        notify_landlord: effectiveAlertSettings.notifyLandlord,
        notify_admin: effectiveAlertSettings.notifyAdmin,
      });
    } else {
      setAlertForm(initialAlertForm);
    }

    setAlertFieldErrors({});
    setAlertError(null);
    setIsAlertModalVisible(false);
  }

  async function handleAlertSettingsSubmit() {
    if (!token || !room) {
      return;
    }

    const parsedWarning = Number(alertForm.warning_power_w);
    const parsedOverload = Number(alertForm.overload_power_w);

    if (!Number.isFinite(parsedWarning) || parsedWarning <= 0) {
      const nextError = 'Enter a valid warning threshold in watts.';
      setAlertFieldErrors({ warning_power_w: nextError });
      setAlertError(nextError);
      showError('Unable to update room alerts', nextError);
      return;
    }

    if (!Number.isFinite(parsedOverload) || parsedOverload <= 0) {
      const nextError = 'Enter a valid overload threshold in watts.';
      setAlertFieldErrors({ overload_power_w: nextError });
      setAlertError(nextError);
      showError('Unable to update room alerts', nextError);
      return;
    }

    if (parsedOverload <= parsedWarning) {
      const nextError = 'Overload threshold must be greater than the warning threshold.';
      setAlertFieldErrors({ overload_power_w: nextError });
      setAlertError(nextError);
      showError('Unable to update room alerts', nextError);
      return;
    }

    try {
      setSavingAlertSettings(true);
      setAlertError(null);
      setAlertFieldErrors({});

      const updatedRoom = await apiRequest<LandlordRoomSnapshot>(
        `/landlord/rooms/${room.roomId}/alert-settings`,
        {
          method: 'PATCH',
          token,
          body: {
            warning_power_w: parsedWarning,
            overload_power_w: parsedOverload,
            notify_tenant: alertForm.notify_tenant,
            notify_landlord: alertForm.notify_landlord,
            notify_admin: alertForm.notify_admin,
          },
        },
      );

      setRoom(updatedRoom);
      closeAlertSettingsModal();
      showSuccess(
        'Room alerts updated',
        'Warning and overload notifications will now follow the new room thresholds.',
      );
    } catch (submitError) {
      if (isUnauthorized(submitError)) {
        await logout();
        return;
      }

      const nextError = getErrorMessage(submitError, 'Unable to update room alert settings.');
      setAlertError(nextError);
      setAlertFieldErrors(getFieldErrors<keyof LandlordRoomAlertFieldErrors>(submitError));
      showError('Unable to update room alerts', nextError);
    } finally {
      setSavingAlertSettings(false);
    }
  }

  async function handleSubmit() {
    if (!token || !room) {
      return;
    }

    const body: Partial<{
      room_tenant_id: number | null;
      room_device_id: number | null;
      room_rate_per_kwh: number;
      room_status: 'available' | 'occupied';
    }> = {};

    if (canUpdateRoomDetails) {
      const parsedRate = Number(form.room_rate_per_kwh);

      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        const nextError = 'Enter a valid room rate per kWh.';
        setFieldErrors({ room_rate_per_kwh: nextError });
        setError(nextError);
        showError('Unable to update room', nextError);
        return;
      }

      body.room_rate_per_kwh = parsedRate;
      body.room_status = form.room_status;
    }

    if (canAssignTenant) {
      body.room_tenant_id = form.room_tenant_id;
    }

    if (canAssignDevice) {
      body.room_device_id = form.room_device_id;
    }

    if (Object.keys(body).length === 0) {
      const nextError = 'No editable landlord room fields are enabled for this account.';
      setError(nextError);
      showError('Unable to update room', nextError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setFieldErrors({});
      const updatedRoom = await apiRequest<LandlordRoomSnapshot>(`/landlord/rooms/${room.roomId}`, {
        method: 'PATCH',
        token,
        body,
      });

      setRoom(updatedRoom);
      closeManageModal();
      await loadRoom();
      showSuccess(
        'Room updated',
        'The room details, tenant assignment, and device assignment were saved successfully.',
      );
    } catch (submitError) {
      if (isUnauthorized(submitError)) {
        await logout();
        return;
      }

      const nextError = getErrorMessage(submitError, 'Unable to update owned room.');
      setError(nextError);
      setFieldErrors(getFieldErrors<keyof LandlordRoomFieldErrors>(submitError));
      showError('Unable to update room', nextError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireRole roles={['landlord']} permissionKey="landlord.rooms.view">
      <ScreenShell
        onRefresh={() => void loadRoom({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle={
          room
            ? 'Review room setup, live usage, and ownership details in one place.'
            : 'Review room setup, usage, and ownership details for this room.'
        }
        title={room?.roomName ?? 'Room Detail'}>
        <SectionCard>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <Text style={styles.helperText}>
            Open the room controls only when you need to change assignments, status, or billing rate.
          </Text>
          <View style={styles.actionRow}>
            <Button
              label="Back to rooms"
              onPress={() => router.replace('/(app)/landlord-rooms')}
              variant="ghost"
            />
            {room && canManageRoom ? (
              <Button label="Manage room" onPress={() => void openManageModal()} />
            ) : null}
          </View>
        </SectionCard>

        {loading ? (
          <SectionCard>
            <ActivityIndicator color={theme.colors.primary} />
          </SectionCard>
        ) : null}

        {!loading && error ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Unable to load room</Text>
            <Text style={styles.errorText}>{error}</Text>
            <View style={styles.singleActionRow}>
              <Button
                label="Back to rooms"
                onPress={() => router.replace('/(app)/landlord-rooms')}
                variant="ghost"
              />
            </View>
          </SectionCard>
        ) : null}

        {!loading && !error && !roomId ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Invalid room</Text>
            <Text style={styles.helperText}>
              This room link is missing a valid room identifier.
            </Text>
          </SectionCard>
        ) : null}

        {!loading && !error && room ? (
          <>
            <SectionCard>
              <View style={[styles.headerRow, isCompactLayout ? styles.headerRowCompact : null]}>
                <View style={styles.headerTextBlock}>
                  <Text style={styles.roomTitle}>{room.roomName}</Text>
                  <Text style={styles.helperText}>
                    {room.tenantName ?? 'Unassigned tenant'} | {room.deviceIdentifier ?? 'Unassigned device'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    room.roomStatus === 'occupied' ? styles.statusPillOccupied : styles.statusPillAvailable,
                  ]}>
                  <Text style={styles.statusPillLabel}>{formatDisplayLabel(room.roomStatus)}</Text>
                </View>
              </View>

              <SummaryGrid items={summaryItems} />
            </SectionCard>

            {criticalAlerts.length > 0 ? (
              <SectionCard>
                <Text style={styles.criticalSectionTitle}>Critical alerts</Text>
                <Text style={styles.helperText}>
                  Resolve these alerts first before treating the room as stable.
                </Text>
                <View style={styles.criticalAlertList}>
                  {criticalAlerts.map((notification) => (
                    <View key={notification.notificationId} style={styles.criticalAlertCard}>
                      <Text style={styles.criticalAlertTitle}>{notification.title}</Text>
                      <Text style={styles.criticalAlertMessage}>{notification.message}</Text>
                      <Text style={styles.criticalAlertMeta}>
                        Received {formatDateTime(notification.createdAt)}
                      </Text>
                    </View>
                  ))}
                </View>
              </SectionCard>
            ) : null}

            <SectionCard>
              <View style={[styles.sectionHeaderRow, isCompactLayout ? styles.sectionHeaderRowCompact : null]}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionTitle}>Setup checklist</Text>
                  <Text style={styles.helperText}>
                    Use this checklist to see whether the room is ready for long-term monitoring.
                  </Text>
                </View>
                {isChecklistComplete ? (
                  <Pressable
                    onPress={() => setIsChecklistCollapsed((current) => !current)}
                    style={({ pressed }) => [
                      styles.checklistToggleButton,
                      pressed ? styles.checklistToggleButtonActive : null,
                    ]}>
                    <Text style={styles.checklistToggleLabel}>
                      {isChecklistCollapsed ? 'Show checklist' : 'Hide checklist'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {isChecklistComplete && isChecklistCollapsed ? (
                <View style={styles.checklistCollapsedSummary}>
                  <Text style={styles.checklistSummaryTitle}>Setup complete</Text>
                  <Text style={styles.helperText}>
                    All room setup requirements are complete. Expand the checklist if you want to review each item.
                  </Text>
                </View>
              ) : (
                <View style={styles.checklistList}>
                  {setupChecklist.map((item) => (
                    <View
                      key={item.label}
                      style={[styles.checklistItem, isCompactLayout ? styles.checklistItemCompact : null]}>
                      <View style={styles.checklistTextBlock}>
                        <Text style={styles.checklistTitle}>{item.label}</Text>
                        <Text style={styles.helperText}>{item.description}</Text>
                      </View>
                      <View
                        style={[
                          styles.checklistStatusPill,
                          item.complete ? styles.checklistComplete : styles.checklistPending,
                        ]}>
                        <Text style={styles.checklistStatusLabel}>
                          {item.complete ? 'Complete' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Assignments and room details</Text>
              <View style={[styles.infoGrid, isCompactLayout ? styles.infoGridCompact : null]}>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Tenant</Text>
                  <Text style={styles.infoValue}>{room.tenantName ?? 'Unassigned tenant'}</Text>
                  {typeof room.tenantEmail === 'string' && room.tenantEmail ? (
                    <Pressable
                      onPress={() => {
                        if (room.tenantEmail) {
                          void handleOpenEmail(room.tenantEmail);
                        }
                      }}>
                      <Text style={styles.contactLink}>{room.tenantEmail}</Text>
                    </Pressable>
                  ) : null}
                  {typeof room.tenantPhone === 'string' && room.tenantPhone ? (
                    <Pressable
                      onPress={() => {
                        if (room.tenantPhone) {
                          void handleOpenPhone(room.tenantPhone);
                        }
                      }}>
                      <Text style={styles.contactLink}>{room.tenantPhone}</Text>
                    </Pressable>
                  ) : null}
                  {!room.tenantEmail && !room.tenantPhone ? (
                    <Text style={styles.infoSubValue}>No tenant contact details yet</Text>
                  ) : null}
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Device</Text>
                  <Text style={styles.infoValue}>{room.deviceIdentifier ?? 'Unassigned device'}</Text>
                  <Text style={styles.infoSubValue}>{room.deviceName ?? 'No device name yet'}</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Rate</Text>
                  <Text style={styles.infoValue}>{formatCurrency(room.roomRatePerKwh)} / kWh</Text>
                  <Text style={styles.infoSubValue}>Current room billing rate</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Updated</Text>
                  <Text style={styles.infoValue}>{formatDateTime(room.latestReading?.timestamp)}</Text>
                  <Text style={styles.infoSubValue}>Latest reading received</Text>
                </View>
              </View>
            </SectionCard>

            <SectionCard>
              <View style={[styles.sectionHeaderRow, isCompactLayout ? styles.sectionHeaderRowCompact : null]}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionTitle}>Room alerts</Text>
                  <Text style={styles.helperText}>
                    Warning, overload, and offline notifications now use these room-specific rules.
                  </Text>
                </View>
                {canManageAlerts ? (
                  <Button
                    label="Edit alerts"
                    onPress={openAlertSettingsModal}
                    variant="ghost"
                  />
                ) : null}
              </View>

              <View style={[styles.infoGrid, isCompactLayout ? styles.infoGridCompact : null]}>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Warning threshold</Text>
                  <Text style={styles.infoValue}>{formatNumber(effectiveAlertSettings.warningPowerW, 'W')}</Text>
                  <Text style={styles.infoSubValue}>Creates a threshold alert when power crosses this level.</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Overload threshold</Text>
                  <Text style={styles.infoValue}>{formatNumber(effectiveAlertSettings.overloadPowerW, 'W')}</Text>
                  <Text style={styles.infoSubValue}>Escalates the alert to critical overload monitoring.</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Recipients</Text>
                  <Text style={styles.infoValue}>{alertRecipientSummary}</Text>
                  <Text style={styles.infoSubValue}>Only enabled recipients will receive room alert notifications.</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Current state</Text>
                  <Text style={styles.infoValue}>{currentAlertState.title}</Text>
                  <Text style={styles.infoSubValue}>{currentAlertState.description}</Text>
                </View>
              </View>
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Detected appliances</Text>
              <Text style={styles.helperText}>
                This reflects the latest appliance activity inferred from the current aggregate reading.
              </Text>
              {room.latestDetection?.appliances.length ? (
                <View style={styles.applianceList}>
                  {room.latestDetection.appliances.map((appliance) => (
                    <View key={`${appliance.applianceTypeId}-${appliance.rank}`} style={styles.applianceCard}>
                      <Text style={styles.applianceTitle}>{appliance.applianceTypeName}</Text>
                      <Text style={styles.applianceMeta}>
                        {appliance.portLabel ?? 'Unmapped port'}
                        {appliance.applianceUptimeSeconds !== null
                          ? ` | Uptime ${formatDuration(appliance.applianceUptimeSeconds)}`
                          : ''}
                      </Text>
                      <Text style={styles.applianceMeta}>
                        {formatDisplayLabel(appliance.categoryName)} | {formatDisplayLabel(appliance.powerPattern)}
                      </Text>
                      <Text style={styles.applianceValueLine}>
                        {formatNumber(appliance.detectedPower, 'W')} | Cost/hr {formatCurrency(getRealtimeCostPerHour(appliance.detectedPower, room.roomRatePerKwh))} | Confidence {formatConfidence(appliance.confidence)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  description="Once a device is assigned and starts sending readings, detected appliances will appear here."
                  title="No appliance activity yet"
                />
              )}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Latest electrical snapshot</Text>
              <View style={[styles.infoGrid, isCompactLayout ? styles.infoGridCompact : null]}>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Energy</Text>
                  <Text style={styles.infoValue}>{formatNumber(room.latestReading?.energyKwh, 'kWh')}</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Voltage</Text>
                  <Text style={styles.infoValue}>{formatNumber(room.latestReading?.voltage, 'V')}</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Current</Text>
                  <Text style={styles.infoValue}>{formatNumber(room.latestReading?.current, 'A')}</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Power factor</Text>
                  <Text style={styles.infoValue}>{formatNumber(room.latestReading?.powerFactor)}</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>Frequency</Text>
                  <Text style={styles.infoValue}>{formatNumber(room.latestReading?.frequency, 'Hz')}</Text>
                </View>
                <View style={[styles.infoCard, isCompactLayout ? styles.infoCardCompact : styles.infoCardWide]}>
                  <Text style={styles.infoLabel}>THD</Text>
                  <Text style={styles.infoValue}>{formatNumber(room.latestReading?.thdPercentage, '%')}</Text>
                </View>
              </View>
            </SectionCard>
          </>
        ) : null}

        <FormModal
          onClose={closeAlertSettingsModal}
          subtitle="These settings control when automatic room alerts are sent to tenants, landlords, and admins."
          title={room ? `${room.roomName} alerts` : 'Room alerts'}
          visible={isAlertModalVisible}>
          <Field
            error={alertFieldErrors.warning_power_w}
            keyboardType="decimal-pad"
            label="Warning threshold (W)"
            onChangeText={(value) =>
              setAlertForm((current) => ({ ...current, warning_power_w: value }))}
            placeholder="1200"
            value={alertForm.warning_power_w}
          />
          <Field
            error={alertFieldErrors.overload_power_w}
            keyboardType="decimal-pad"
            label="Overload threshold (W)"
            onChangeText={(value) =>
              setAlertForm((current) => ({ ...current, overload_power_w: value }))}
            placeholder="1800"
            value={alertForm.overload_power_w}
          />

          <View style={styles.toggleList}>
            <View style={styles.toggleCard}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>Notify tenant</Text>
                <Text style={styles.helperText}>Warn the assigned tenant when this room reaches a threshold or overload state.</Text>
              </View>
              <Switch
                onValueChange={(value) =>
                  setAlertForm((current) => ({ ...current, notify_tenant: value }))}
                thumbColor={alertForm.notify_tenant ? theme.colors.white : '#E7ECEE'}
                trackColor={{ false: theme.colors.danger, true: theme.colors.primary }}
                value={alertForm.notify_tenant}
              />
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>Notify landlord</Text>
                <Text style={styles.helperText}>Keep this room in your landlord inbox when usage crosses the configured thresholds.</Text>
              </View>
              <Switch
                onValueChange={(value) =>
                  setAlertForm((current) => ({ ...current, notify_landlord: value }))}
                thumbColor={alertForm.notify_landlord ? theme.colors.white : '#E7ECEE'}
                trackColor={{ false: theme.colors.danger, true: theme.colors.primary }}
                value={alertForm.notify_landlord}
              />
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>Notify admin</Text>
                <Text style={styles.helperText}>Escalate this room’s warning and overload events to admin support too.</Text>
              </View>
              <Switch
                onValueChange={(value) =>
                  setAlertForm((current) => ({ ...current, notify_admin: value }))}
                thumbColor={alertForm.notify_admin ? theme.colors.white : '#E7ECEE'}
                trackColor={{ false: theme.colors.danger, true: theme.colors.primary }}
                value={alertForm.notify_admin}
              />
            </View>
          </View>

          {alertError ? <Text style={styles.errorText}>{alertError}</Text> : null}

          <View style={styles.modalButtonRow}>
            <Button
              label="Save alert settings"
              loading={savingAlertSettings}
              onPress={() => void handleAlertSettingsSubmit()}
            />
            <Button label="Cancel" onPress={closeAlertSettingsModal} variant="ghost" />
          </View>
        </FormModal>

        <FormModal
          onClose={closeManageModal}
          subtitle="Only your owned room assignments and billing details can be edited here."
          title={room ? `Manage ${room.roomName}` : 'Manage room'}
          visible={isFormModalVisible}>
          {room ? (
            <View style={styles.summaryBlock}>
              <Text style={styles.roomTitle}>{room.roomName}</Text>
              <Text style={styles.helperText}>
                Current tenant: {room.tenantName ?? 'Unassigned'}
              </Text>
              <Text style={styles.helperText}>
                Current device: {room.deviceIdentifier ?? 'Unassigned'}
              </Text>
            </View>
          ) : null}

          {canUpdateRoomDetails ? (
            <>
              <Field
                error={fieldErrors.room_rate_per_kwh}
                keyboardType="decimal-pad"
                label="Rate per kWh"
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, room_rate_per_kwh: value }))
                }
                placeholder="12.50"
                value={form.room_rate_per_kwh}
              />
              <SelectField
                error={fieldErrors.room_status}
                label="Status"
                options={[
                  { label: formatDisplayLabel('available'), value: 'available' as const },
                  { label: formatDisplayLabel('occupied'), value: 'occupied' as const },
                ]}
                selectedValue={form.room_status}
                onSelect={(value) =>
                  setForm((current) => ({
                    ...current,
                    room_status: value as 'available' | 'occupied',
                  }))
                }
              />
            </>
          ) : null}

          {canAssignTenant ? (
            <>
              {optionsLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
              {!optionsLoading ? (
                <SelectField
                  error={fieldErrors.room_tenant_id}
                  label="Tenant assignment"
                  options={tenantOptions}
                  selectedValue={form.room_tenant_id ?? UNASSIGNED_OPTION}
                  onSelect={(value) =>
                    setForm((current) => ({
                      ...current,
                      room_tenant_id: value === UNASSIGNED_OPTION ? null : Number(value),
                    }))
                  }
                />
              ) : null}
            </>
          ) : null}

          {canAssignDevice ? (
            <>
              {optionsLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
              {!optionsLoading ? (
                <SelectField
                  error={fieldErrors.room_device_id}
                  label="Device assignment"
                  options={deviceOptions}
                  selectedValue={form.room_device_id ?? UNASSIGNED_OPTION}
                  onSelect={(value) =>
                    setForm((current) => ({
                      ...current,
                      room_device_id: value === UNASSIGNED_OPTION ? null : Number(value),
                    }))
                  }
                />
              ) : null}
            </>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.modalButtonRow}>
            <Button label="Save room changes" loading={saving} onPress={() => void handleSubmit()} />
            <Button label="Cancel" onPress={closeManageModal} variant="ghost" />
          </View>
        </FormModal>
      </ScreenShell>
    </RequireRole>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeaderRowCompact: {
    flexDirection: 'column',
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  singleActionRow: {
    paddingTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerRowCompact: {
    flexDirection: 'column',
  },
  headerTextBlock: {
    flex: 1,
    gap: 6,
  },
  roomTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  criticalSectionTitle: {
    color: theme.colors.danger,
    fontSize: 18,
    fontWeight: '800',
  },
  criticalAlertList: {
    gap: 10,
  },
  criticalAlertCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(224,93,93,0.42)',
    backgroundColor: 'rgba(224,93,93,0.10)',
    padding: 14,
    gap: 6,
  },
  criticalAlertTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  criticalAlertMessage: {
    color: theme.colors.text,
    lineHeight: 21,
  },
  criticalAlertMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillOccupied: {
    backgroundColor: 'rgba(79,163,181,0.16)',
    borderColor: theme.colors.primary,
  },
  statusPillAvailable: {
    backgroundColor: 'rgba(63,191,127,0.14)',
    borderColor: theme.colors.success,
  },
  statusPillLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  checklistList: {
    gap: 10,
  },
  checklistCollapsedSummary: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  checklistSummaryTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  checklistToggleButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.overlaySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  checklistToggleButtonActive: {
    backgroundColor: 'rgba(79,163,181,0.12)',
    borderColor: 'rgba(79,163,181,0.32)',
  },
  checklistToggleLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  checklistItem: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  checklistItemCompact: {
    flexDirection: 'column',
  },
  checklistTextBlock: {
    flex: 1,
    gap: 4,
  },
  checklistTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  checklistStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  checklistComplete: {
    backgroundColor: 'rgba(63,191,127,0.14)',
    borderColor: theme.colors.success,
  },
  checklistPending: {
    backgroundColor: 'rgba(224,93,93,0.14)',
    borderColor: theme.colors.danger,
  },
  checklistStatusLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoGridCompact: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  infoCard: {
    minHeight: 86,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayMedium,
    backgroundColor: theme.colors.surfaceMuted,
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoCardWide: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 150,
  },
  infoCardCompact: {
    width: '100%',
    minWidth: 0,
  },
  infoLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  infoSubValue: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  contactLink: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  applianceList: {
    gap: 10,
  },
  applianceCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 4,
  },
  applianceTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  applianceMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  applianceValueLine: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  summaryBlock: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  modalButtonRow: {
    gap: 10,
  },
  toggleList: {
    gap: 10,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.overlaySoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});

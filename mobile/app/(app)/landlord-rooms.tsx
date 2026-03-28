import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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

const initialForm = {
  room_name: '',
  room_tenant_id: null as number | null,
  room_device_id: null as number | null,
  room_rate_per_kwh: '12.00',
  room_status: 'available' as 'available' | 'occupied',
};

type LandlordRoomFieldErrors = Partial<
  Record<'room_name' | 'room_tenant_id' | 'room_device_id' | 'room_rate_per_kwh' | 'room_status', string>
>;

function roomNeedsAttention(room: LandlordRoomSnapshot) {
  return !room.tenantId || !room.deviceId || !room.latestReading;
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

export default function LandlordRoomsScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout, user } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<LandlordRoomSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criticalAlertsByRoomId, setCriticalAlertsByRoomId] = useState<Record<number, NotificationRecord[]>>({});
  const [editingRoom, setEditingRoom] = useState<LandlordRoomSnapshot | null>(null);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<LandlordRoomFieldErrors>({});
  const [assignmentOptions, setAssignmentOptions] = useState<LandlordRoomManagementOptions>({
    tenants: [],
    devices: [],
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied'>('all');
  const [attentionFilter, setAttentionFilter] = useState<'all' | 'ready' | 'needs_attention'>('all');

  const canUpdateRoomDetails = Boolean(user && hasModuleAccess(user, 'landlord.rooms.update'));
  const canCreateRoom = Boolean(user && hasModuleAccess(user, 'landlord.rooms.create'));
  const canAssignTenant = Boolean(user && hasModuleAccess(user, 'landlord.tenants.assign'));
  const canAssignDevice = Boolean(user && hasModuleAccess(user, 'landlord.devices.assign'));
  const canManageRoom = canUpdateRoomDetails || canAssignTenant || canAssignDevice;

  const loadData = useCallback(async (options?: { pullToRefresh?: boolean }) => {
    if (!token) {
      return;
    }

    try {
      if (options?.pullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      const [roomsResult, notificationsResult] = await Promise.allSettled([
        apiRequest<LandlordRoomSnapshot[]>('/landlord/rooms', { token }),
        apiRequest<NotificationsData>('/notifications', { token }),
      ]);

      if (roomsResult.status === 'rejected') {
        throw roomsResult.reason;
      }

      setRooms(roomsResult.value);

      if (notificationsResult.status === 'fulfilled') {
        const groupedAlerts = notificationsResult.value.notifications
          .filter((notification) => notification.severity === 'critical')
          .reduce<Record<number, NotificationRecord[]>>((groups, notification) => {
            const roomId = getRoomIdFromNotification(notification);

            if (!roomId) {
              return groups;
            }

            const existing = groups[roomId] ?? [];
            existing.push(notification);
            groups[roomId] = existing;
            return groups;
          }, {});

        Object.values(groupedAlerts).forEach((alerts) => {
          alerts.sort((left, right) => {
            if (left.isRead !== right.isRead) {
              return left.isRead ? 1 : -1;
            }

            return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          });
        });

        setCriticalAlertsByRoomId(groupedAlerts);
      } else {
        setCriticalAlertsByRoomId({});
      }
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load landlord rooms.'));
      setCriticalAlertsByRoomId({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, token]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const tenantOptions = useMemo<Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }>>(
    () => [
      { label: 'Unassigned tenant', value: UNASSIGNED_OPTION },
      ...assignmentOptions.tenants.map((tenant) => ({
        label:
          tenant.assignedRoomName && editingRoom && tenant.assignedRoomId === editingRoom.roomId
            ? `${tenant.userName} (current)`
            : tenant.userName,
        value: tenant.userId,
      })),
    ],
    [assignmentOptions.tenants, editingRoom],
  );

  const deviceOptions = useMemo<Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }>>(
    () => [
      { label: 'Unassigned device', value: UNASSIGNED_OPTION },
      ...assignmentOptions.devices.map((device) => ({
        label:
          device.assignedRoomName && editingRoom && device.assignedRoomId === editingRoom.roomId
            ? `${device.deviceIdentifier} (current)`
            : `${device.deviceIdentifier} - ${device.deviceName}`,
        value: device.deviceId,
      })),
    ],
    [assignmentOptions.devices, editingRoom],
  );

  async function openManageModal(room: LandlordRoomSnapshot) {
    setEditingRoom(room);
    setForm({
      room_name: room.roomName,
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
    setEditingRoom(null);
    setForm(initialForm);
    setFieldErrors({});
    setAssignmentOptions({ tenants: [], devices: [] });
    setIsFormModalVisible(false);
    setError(null);
  }

  function openCreateModal() {
    setEditingRoom(null);
    setForm(initialForm);
    setFieldErrors({});
    setAssignmentOptions({ tenants: [], devices: [] });
    setError(null);
    setIsFormModalVisible(true);
  }

  async function handleSubmit() {
    if (!token) {
      return;
    }

    if (!editingRoom) {
      if (!form.room_name.trim()) {
        const nextError = 'Room name is required.';
        setFieldErrors({ room_name: nextError });
        setError(nextError);
        showError('Unable to create room', nextError);
        return;
      }

      const parsedCreateRate = Number(form.room_rate_per_kwh);

      if (!Number.isFinite(parsedCreateRate) || parsedCreateRate <= 0) {
        const nextError = 'Enter a valid room rate per kWh.';
        setFieldErrors({ room_rate_per_kwh: nextError });
        setError(nextError);
        showError('Unable to create room', nextError);
        return;
      }

      try {
        setSaving(true);
        setError(null);
        setFieldErrors({});
        const createdRoom = await apiRequest<LandlordRoomSnapshot>('/landlord/rooms', {
          method: 'POST',
          token,
          body: {
            room_name: form.room_name.trim(),
            room_rate_per_kwh: parsedCreateRate,
          },
        });

        setRooms((current) => [...current, createdRoom]);
        closeManageModal();
        await loadData();
        showSuccess(
          'Room created',
          'The room is now under your ownership and starts as available with no tenant or device assigned.',
        );
      } catch (submitError) {
        if (isUnauthorized(submitError)) {
          await logout();
          return;
        }

        const nextError = getErrorMessage(submitError, 'Unable to create owned room.');
        setError(nextError);
        setFieldErrors(getFieldErrors<keyof LandlordRoomFieldErrors>(submitError));
        showError('Unable to create room', nextError);
      } finally {
        setSaving(false);
      }

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
      const updatedRoom = await apiRequest<LandlordRoomSnapshot>(
        `/landlord/rooms/${editingRoom.roomId}`,
        {
          method: 'PATCH',
          token,
          body,
        },
      );

      setRooms((current) =>
        current.map((room) => (room.roomId === updatedRoom.roomId ? updatedRoom : room)),
      );
      closeManageModal();
      showSuccess(
        'Owned room updated',
        'Your room assignments and billing details were saved successfully.',
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

  const filteredRooms = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rooms.filter((room) => {
      const needsAttention = roomNeedsAttention(room);
      const matchesSearch =
        !normalizedSearch
        || [
          room.roomName,
          room.tenantName ?? '',
          room.deviceIdentifier ?? '',
          room.latestDetection?.applianceTypeName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesStatus = statusFilter === 'all' || room.roomStatus === statusFilter;
      const matchesAttention =
        attentionFilter === 'all'
        || (attentionFilter === 'ready' ? !needsAttention : needsAttention);

      return matchesSearch && matchesStatus && matchesAttention;
    });
  }, [attentionFilter, rooms, searchTerm, statusFilter]);

  const summaryItems = useMemo(() => {
    const needsAttentionCount = rooms.filter((room) => roomNeedsAttention(room)).length;

    return [
      { label: 'Owned rooms', value: String(rooms.length) },
      {
        label: 'Occupied',
        value: String(rooms.filter((room) => room.roomStatus === 'occupied').length),
      },
      { label: 'Ready to monitor', value: String(rooms.length - needsAttentionCount) },
      { label: 'Needs attention', value: String(needsAttentionCount) },
    ];
  }, [rooms]);

  return (
    <RequireRole roles={['landlord']} permissionKey="landlord.rooms.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Review your owned rooms, then manage tenant, device, rate, and occupancy only when needed."
        title="My Rooms">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Use this view to spot which rooms are fully operating, then create or manage owned rooms only when needed.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        {canCreateRoom ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <Text style={styles.helperText}>
              Create a new room under your ownership. It will start as available with no tenant or device assigned.
            </Text>
            <View style={styles.actionRow}>
              <Button label="Create room" onPress={openCreateModal} />
            </View>
          </SectionCard>
        ) : null}

        <SectionCard>
          <Text style={styles.sectionTitle}>Find and manage</Text>
          <Text style={styles.helperText}>
            Search by room, tenant, device, or top appliance to narrow the list before opening a room.
          </Text>
          <Field
            autoCapitalize="words"
            label="Search rooms"
            onChangeText={setSearchTerm}
            placeholder="Search room, tenant, device, or appliance"
            value={searchTerm}
          />
          <View style={styles.filterRow}>
            <View style={styles.filterItem}>
              <SelectField
                label="Status filter"
                options={[
                  { label: 'All statuses', value: 'all' as const },
                  { label: formatDisplayLabel('available'), value: 'available' as const },
                  { label: formatDisplayLabel('occupied'), value: 'occupied' as const },
                ]}
                selectedValue={statusFilter}
                onSelect={(value) => setStatusFilter(value as 'all' | 'available' | 'occupied')}
              />
            </View>
            <View style={styles.filterItem}>
              <SelectField
                label="Attention filter"
                options={[
                  { label: 'All rooms', value: 'all' as const },
                  { label: 'Ready to monitor', value: 'ready' as const },
                  { label: 'Needs attention', value: 'needs_attention' as const },
                ]}
                selectedValue={attentionFilter}
                onSelect={(value) =>
                  setAttentionFilter(value as 'all' | 'ready' | 'needs_attention')
                }
              />
            </View>
          </View>
          {canManageRoom ? (
            <Text style={styles.helperText}>
              You can update room rate and status, then assign or unassign tenants and devices for your own rooms.
            </Text>
          ) : null}
          {error && !isFormModalVisible ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Owned rooms</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredRooms.length} of {rooms.length} owned rooms.
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
          {!loading && !error && filteredRooms.length === 0 ? (
            <EmptyState
              description={
                rooms.length
                  ? 'Try a different search or filter to find the room you need.'
                  : 'Ask the admin to assign rooms to your landlord account to start monitoring them here.'
              }
              title={rooms.length ? 'No matching rooms' : 'No owned rooms yet'}
            />
          ) : null}
          {!loading && !error
            ? filteredRooms.map((room, index) => {
              const needsAttention = roomNeedsAttention(room);
              const roomCriticalAlerts = criticalAlertsByRoomId[room.roomId] ?? [];
              const topCriticalAlert = roomCriticalAlerts[0] ?? null;

                return (
                  <View
                    key={room.roomId}
                    style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
                    <Pressable
                      onPress={() => router.push(`/landlord-room-detail?roomId=${room.roomId}`)}
                      android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
                      style={({ hovered, pressed }) => [
                        styles.cardPressable,
                        (pressed || hovered) ? styles.cardPressableActive : null,
                      ]}>
                      <View style={styles.listHeader}>
                        <Text style={styles.itemTitle}>{room.roomName}</Text>
                        <View style={styles.headerBadges}>
                          <View
                            style={[
                              styles.statusPill,
                              room.roomStatus === 'occupied'
                                ? styles.statusPillOccupied
                                : styles.statusPillAvailable,
                            ]}>
                            <Text style={styles.statusPillLabel}>{formatDisplayLabel(room.roomStatus)}</Text>
                          </View>
                          <View
                            style={[
                              styles.statusPill,
                              needsAttention ? styles.statusPillAttention : styles.statusPillStable,
                            ]}>
                            <Text style={styles.statusPillLabel}>
                              {needsAttention ? 'Needs attention' : 'Ready'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <Text style={styles.primaryIdentityText}>
                        {room.tenantName ?? 'No tenant assigned'}
                      </Text>
                      <Text style={styles.secondaryIdentityText}>
                        {room.deviceIdentifier ?? 'No device assigned'}
                      </Text>

                      {topCriticalAlert ? (
                        <View style={styles.criticalAlertCard}>
                          <Text style={styles.criticalAlertTitle}>{topCriticalAlert.title}</Text>
                          <Text style={styles.criticalAlertMessage}>{topCriticalAlert.message}</Text>
                          <Text style={styles.criticalAlertMeta}>
                            {roomCriticalAlerts.length > 1
                              ? `${roomCriticalAlerts.length} critical alerts active`
                              : `Received ${formatDateTime(topCriticalAlert.createdAt)}`}
                          </Text>
                        </View>
                      ) : null}

                      <View style={styles.metaRow}>
                        <View style={styles.metaPill}>
                          <Text style={styles.metaLabel}>Rate</Text>
                          <Text style={styles.metaValue}>{formatCurrency(room.roomRatePerKwh)} / kWh</Text>
                        </View>
                        <View style={styles.metaPill}>
                          <Text style={styles.metaLabel}>Updated</Text>
                          <Text style={styles.metaValue}>{formatDateTime(room.latestReading?.timestamp)}</Text>
                        </View>
                      </View>

                      <View style={styles.primaryStatsRow}>
                        <View style={styles.primaryStatCard}>
                          <Text style={styles.statLabel}>Current power</Text>
                          <Text style={styles.primaryStatValue}>
                            {formatNumber(room.latestReading?.powerW, 'W')}
                          </Text>
                        </View>
                        <View style={styles.primaryStatCard}>
                          <Text style={styles.statLabel}>Monthly estimate</Text>
                          <Text style={styles.primaryStatValue}>
                            {formatCurrency(room.estimatedMonthlyCost)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.secondaryStatsRow}>
                        <View style={styles.secondaryStatCard}>
                          <Text style={styles.statLabel}>Device uptime</Text>
                          <Text style={styles.secondaryStatValue}>
                            {room.deviceUptimeSeconds !== null
                              ? formatDuration(room.deviceUptimeSeconds)
                              : 'Offline'}
                          </Text>
                        </View>
                        <View style={styles.secondaryStatCard}>
                          <Text style={styles.statLabel}>Detection confidence</Text>
                          <Text style={styles.secondaryStatValue}>
                            {formatConfidence(room.latestDetection?.confidence)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.highlightBlock}>
                        <Text style={styles.highlightLabel}>Top appliance</Text>
                        <Text style={styles.highlightValue}>
                          {room.latestDetection?.applianceTypeName ?? 'No confident match'}
                        </Text>
                      </View>

                      <View style={styles.tapHintRow}>
                        <Text style={styles.tapHintText}>Tap card to open room details</Text>
                        <Text style={styles.tapHintArrow}>{'>'}</Text>
                      </View>
                    </Pressable>

                    {canManageRoom ? (
                      <View style={styles.cardButtonRow}>
                        <Button label="Manage room" onPress={() => void openManageModal(room)} />
                      </View>
                    ) : null}
                  </View>
                );
              })
            : null}
        </SectionCard>

        <FormModal
          onClose={closeManageModal}
          subtitle={
            editingRoom
              ? 'Only your owned room assignments and billing details can be edited here.'
              : 'Create a room that automatically belongs to your landlord account and starts as available.'
          }
          title={editingRoom ? `Manage ${editingRoom.roomName}` : 'Create room'}
          visible={isFormModalVisible}>
          {!editingRoom ? (
            <>
              <Field
                error={fieldErrors.room_name}
                label="Room name"
                onChangeText={(value) => setForm((current) => ({ ...current, room_name: value }))}
                placeholder="Room 201"
                value={form.room_name}
              />
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
            </>
          ) : null}

          {editingRoom ? (
            <View style={styles.summaryBlock}>
              <Text style={styles.itemTitle}>{editingRoom.roomName}</Text>
              <Text style={styles.helperText}>
                Current tenant: {editingRoom.tenantName ?? 'Unassigned'}
              </Text>
              <Text style={styles.helperText}>
                Current device: {editingRoom.deviceIdentifier ?? 'Unassigned'}
              </Text>
            </View>
          ) : null}

          {editingRoom && canUpdateRoomDetails ? (
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

          {editingRoom && canAssignTenant ? (
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

          {editingRoom && canAssignDevice ? (
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
          <View style={styles.buttonRow}>
            <Button
              label={editingRoom ? 'Save room changes' : 'Create room'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterItem: {
    flex: 1,
    minWidth: 160,
  },
  listItem: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  listItemFirst: {
    borderWidth: 1,
  },
  listHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerBadges: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 8,
  },
  itemTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryBlock: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  buttonRow: {
    gap: 10,
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
  statusPillAttention: {
    backgroundColor: 'rgba(224,93,93,0.14)',
    borderColor: theme.colors.danger,
  },
  statusPillStable: {
    backgroundColor: 'rgba(63,191,127,0.14)',
    borderColor: theme.colors.success,
  },
  statusPillLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  primaryIdentityText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryIdentityText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  criticalAlertCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(224,93,93,0.42)',
    backgroundColor: 'rgba(224,93,93,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  criticalAlertTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  criticalAlertMessage: {
    color: theme.colors.text,
    lineHeight: 20,
  },
  criticalAlertMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayMedium,
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryStatCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    backgroundColor: 'rgba(79,163,181,0.12)',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(79,163,181,0.28)',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  primaryStatValue: {
    color: theme.colors.white,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  secondaryStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryStatCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayMedium,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 5,
  },
  secondaryStatValue: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  highlightBlock: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.overlayMedium,
    gap: 6,
    minHeight: 76,
    paddingTop: 12,
  },
  highlightLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  highlightValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    minHeight: 44,
  },
  actionRow: {
    paddingTop: 4,
  },
  cardButtonRow: {
    paddingTop: 4,
  },
  cardPressable: {
    gap: 12,
    borderRadius: theme.radius.sm,
    padding: 2,
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
    marginTop: 2,
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
});

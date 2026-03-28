import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
import { Device, Room, UsersPayload } from '@/src/types/models';
import { getErrorMessage, getFieldErrors, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency, formatDisplayLabel } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const UNASSIGNED_OPTION = 'unassigned';

const initialForm = {
  room_name: '',
  room_landlord_id: null as number | null,
  room_tenant_id: null as number | null,
  room_device_id: null as number | null,
  room_rate_per_kwh: '12.00',
  room_status: 'available' as 'available' | 'occupied',
};

type RoomFieldErrors = Partial<
  Record<
    | 'room_name'
    | 'room_landlord_id'
    | 'room_tenant_id'
    | 'room_device_id'
    | 'room_rate_per_kwh'
    | 'room_status',
    string
  >
>;

export default function RoomsScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RoomFieldErrors>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Room['roomStatus']>('all');
  const [setupFilter, setSetupFilter] = useState<'all' | 'ready' | 'needs_setup'>('all');

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
      const [roomsData, usersData, devicesData] = await Promise.all([
        apiRequest<Room[]>('/rooms', { token }),
        apiRequest<UsersPayload>('/users', { token }),
        apiRequest<Device[]>('/devices', { token }),
      ]);

      setRooms(roomsData);
      setUsersPayload(usersData);
      setDevices(devicesData);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load rooms.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  async function handleSubmit() {
    if (!token) {
      return;
    }

    if (!form.room_name.trim()) {
      const nextError = 'Room name is required.';
      setError(nextError);
      setFieldErrors({ room_name: nextError });
      showError('Unable to save room', nextError);
      return;
    }

    const parsedRate = Number(form.room_rate_per_kwh);

    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      const nextError = 'Enter a valid room rate per kWh.';
      setError(nextError);
      setFieldErrors({ room_rate_per_kwh: nextError });
      showError('Unable to save room', nextError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setFieldErrors({});
      setMessage(null);
      let successTitle = '';
      let successMessage = '';

      const body = {
        room_name: form.room_name.trim(),
        room_landlord_id: form.room_landlord_id,
        room_tenant_id: form.room_tenant_id,
        room_device_id: form.room_device_id,
        room_rate_per_kwh: parsedRate,
        room_status: form.room_status,
      };

      if (editingRoomId) {
        const updatedRoom = await apiRequest<Room>(`/rooms/${editingRoomId}`, {
          method: 'PATCH',
          token,
          body,
        });
        setRooms((current) =>
          current.map((room) => (room.roomId === updatedRoom.roomId ? updatedRoom : room)),
        );
        setMessage('Room updated successfully.');
        successTitle = 'Room updated';
        successMessage = 'The room details and assignments were saved successfully.';
      } else {
        const createdRoom = await apiRequest<Room>('/rooms', {
          method: 'POST',
          token,
          body,
        });
        setRooms((current) => [...current, createdRoom]);
        setMessage('Room created successfully.');
        successTitle = 'Room created';
        successMessage = 'The room is ready and can stay unassigned until needed.';
      }

      closeFormModal();
      await loadData();
      showSuccess(successTitle, successMessage);
    } catch (submitError) {
      const nextError = getErrorMessage(submitError, 'Unable to save room.');
      setError(nextError);
      setFieldErrors(getFieldErrors<keyof RoomFieldErrors>(submitError));
      showError('Unable to save room', nextError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom() {
    if (!token || editingRoomId === null) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await apiRequest(`/rooms/${editingRoomId}`, {
        method: 'DELETE',
        token,
      });
      closeFormModal();
      await loadData();
      showSuccess(
        'Room deleted',
        'The unassigned room was removed successfully.',
      );
    } catch (deleteError) {
      const nextError = getErrorMessage(deleteError, 'Unable to delete room.');
      setError(nextError);
      showError('Unable to delete room', nextError);
    } finally {
      setDeleting(false);
    }
  }

  function startEdit(room: Room) {
    setEditingRoomId(room.roomId);
    setForm({
      room_name: room.roomName,
      room_landlord_id: room.landlordId,
      room_tenant_id: room.tenantId,
      room_device_id: room.deviceId,
      room_rate_per_kwh: String(room.roomRatePerKwh),
      room_status: room.roomStatus,
    });
    setError(null);
    setFieldErrors({});
    setMessage(null);
    setIsFormModalVisible(true);
  }

  function closeFormModal() {
    setEditingRoomId(null);
    setForm(initialForm);
    setError(null);
    setFieldErrors({});
    setIsFormModalVisible(false);
  }

  function openCreateModal() {
    setEditingRoomId(null);
    setForm(initialForm);
    setError(null);
    setFieldErrors({});
    setMessage(null);
    setIsFormModalVisible(true);
  }

  const unavailableTenantIds = new Set(
    rooms
      .filter((room) => room.tenantId !== null && room.roomId !== editingRoomId)
      .map((room) => room.tenantId as number),
  );

  const unavailableDeviceIds = new Set(
    rooms
      .filter((room) => room.deviceId !== null && room.roomId !== editingRoomId)
      .map((room) => room.deviceId as number),
  );

  const tenantOptions: Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }> = [
    { label: 'Unassigned tenant', value: UNASSIGNED_OPTION },
    ...(
      usersPayload?.users
        .filter(
          (user) =>
            user.roleName === 'tenant'
            && !unavailableTenantIds.has(user.userId)
            && (
              form.room_landlord_id === null
              || user.landlordOwnerId === form.room_landlord_id
              || form.room_tenant_id === user.userId
            ),
        )
        .map((user) => ({
          label:
            form.room_landlord_id !== null && user.landlordOwnerName
              ? `${user.userName} (${user.landlordOwnerName})`
              : user.userName,
          value: user.userId,
        })) || []
    ),
  ];

  const landlordOptions: Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }> = [
    { label: 'Unassigned landlord', value: UNASSIGNED_OPTION },
    ...(
      usersPayload?.users
        .filter((user) => user.roleName === 'landlord')
        .map((user) => ({
          label: user.userName,
          value: user.userId,
        })) || []
    ),
  ];

  const deviceOptions: Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }> = [
    { label: 'Unassigned device', value: UNASSIGNED_OPTION },
    ...devices
      .filter(
        (device) =>
          !unavailableDeviceIds.has(device.deviceId)
          && (
            form.room_device_id === device.deviceId
            || (
              form.room_landlord_id === null
                ? device.deviceOwnerLandlordId === null
                : device.deviceOwnerLandlordId === form.room_landlord_id
            )
          ),
      )
      .map((device) => ({
        label:
          `${device.deviceIdentifier ?? 'No identifier'} - ${device.deviceName}`
          + (
            device.deviceOwnerLandlordName
              ? ` (${device.deviceOwnerLandlordName})`
              : ' (Admin inventory)'
          ),
        value: device.deviceId,
      })),
  ];

  const editingRoom = editingRoomId !== null
    ? rooms.find((room) => room.roomId === editingRoomId) ?? null
    : null;

  const canDeleteEditingRoom = Boolean(
    editingRoom
      && editingRoom.roomStatus === 'available'
      && editingRoom.landlordId === null
      && editingRoom.tenantId === null
      && editingRoom.deviceId === null,
  );

  const filteredRooms = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rooms.filter((room) => {
      const isReady = Boolean(room.landlordId && room.tenantId && room.deviceId);
      const matchesSearch =
        !normalizedSearch
        || [
          room.roomName,
          room.landlordName ?? '',
          room.tenantName ?? '',
          room.deviceIdentifier ?? '',
          room.deviceName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesStatus = statusFilter === 'all' || room.roomStatus === statusFilter;
      const matchesSetup =
        setupFilter === 'all'
        || (setupFilter === 'ready' ? isReady : !isReady);

      return matchesSearch && matchesStatus && matchesSetup;
    });
  }, [rooms, searchTerm, setupFilter, statusFilter]);

  const summaryItems = useMemo(() => {
    const readyCount = rooms.filter((room) => room.landlordId && room.tenantId && room.deviceId).length;

    return [
      { label: 'Total rooms', value: String(rooms.length) },
      { label: 'Ready rooms', value: String(readyCount) },
      {
        label: 'Occupied',
        value: String(rooms.filter((room) => room.roomStatus === 'occupied').length),
      },
      { label: 'Needs setup', value: String(rooms.length - readyCount) },
    ];
  }, [rooms]);

  return (
    <RequireRole roles={['admin']} permissionKey="rooms.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Create rooms first, then assign landlord, tenant, and device only when each one is ready."
        title="Room Management">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            This view shows which rooms are fully set up and which ones still need assignments before monitoring begins.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <Text style={styles.helperText}>
            Use this when you need to add a room before reviewing or filtering the current list.
          </Text>
          <View style={styles.actionRow}>
            <Button label="Create room" onPress={openCreateModal} />
          </View>
          {error && !isFormModalVisible ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Find and manage</Text>
          <Text style={styles.helperText}>
            Search by room, landlord, tenant, or device to narrow the list before opening one.
          </Text>
          <Field
            autoCapitalize="words"
            label="Search rooms"
            onChangeText={setSearchTerm}
            placeholder="Search room, landlord, tenant, or device"
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
                onSelect={(value) => setStatusFilter(value as 'all' | Room['roomStatus'])}
              />
            </View>
            <View style={styles.filterItem}>
              <SelectField
                label="Setup filter"
                options={[
                  { label: 'All rooms', value: 'all' as const },
                  { label: 'Ready rooms', value: 'ready' as const },
                  { label: 'Needs setup', value: 'needs_setup' as const },
                ]}
                selectedValue={setupFilter}
                onSelect={(value) => setSetupFilter(value as 'all' | 'ready' | 'needs_setup')}
              />
            </View>
          </View>
          <Text style={styles.helperText}>
            Delete is only allowed for rooms that are available and have no assigned landlord, tenant, or device.
          </Text>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Configured rooms</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredRooms.length} of {rooms.length} rooms.
            </Text>
          ) : null}
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : filteredRooms.length ? (
            filteredRooms.map((room, index) => {
              const isReady = Boolean(room.landlordId && room.tenantId && room.deviceId);
              const assignmentsComplete = [
                room.landlordId,
                room.tenantId,
                room.deviceId,
              ].filter(Boolean).length;

              return (
                <View
                  key={room.roomId}
                  style={[styles.listCard, index === 0 ? styles.listCardFirst : null]}>
                  <View style={styles.listHeader}>
                    <Text style={styles.itemTitle}>{room.roomName}</Text>
                    <View style={styles.badgeRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{formatDisplayLabel(room.roomStatus)}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgeMuted]}>
                        <Text style={styles.badgeText}>
                          {isReady ? 'Ready to monitor' : 'Needs setup'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.helperText}>
                    Landlord: {room.landlordName ?? 'Unassigned landlord'}
                  </Text>
                  <Text style={styles.helperText}>
                    Tenant: {room.tenantName ?? 'Unassigned tenant'}
                  </Text>
                  <Text style={styles.helperText}>
                    Device: {room.deviceIdentifier ?? 'Unassigned device'}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Billing rate</Text>
                      <Text style={styles.metaValue}>{formatCurrency(room.roomRatePerKwh)} / kWh</Text>
                    </View>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Assignments</Text>
                      <Text style={styles.metaValue}>{assignmentsComplete} of 3 complete</Text>
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <Button label="Edit room" onPress={() => startEdit(room)} variant="ghost" />
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              description={
                rooms.length
                  ? 'Try a different search or filter to find the room you need.'
                  : 'Create rooms even before a tenant moves in or a device is installed.'
              }
              title={rooms.length ? 'No matching rooms' : 'No rooms yet'}
            />
          )}
        </SectionCard>

        <FormModal
          onClose={closeFormModal}
          subtitle="Set the room name, rate, and status. Landlord, tenant, and device assignments can stay unassigned."
          title={editingRoomId ? 'Update room' : 'Create room'}
          visible={isFormModalVisible}>
          <Field
            error={fieldErrors.room_name}
            label="Room name"
            onChangeText={(value) => setForm((current) => ({ ...current, room_name: value }))}
            placeholder="Room 101"
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
          <SelectField
            error={fieldErrors.room_landlord_id}
            label="Landlord"
            options={landlordOptions}
            selectedValue={form.room_landlord_id ?? UNASSIGNED_OPTION}
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                room_landlord_id: value === UNASSIGNED_OPTION ? null : Number(value),
              }))
            }
          />
          <SelectField
            error={fieldErrors.room_tenant_id}
            label="Tenant"
            options={tenantOptions}
            selectedValue={form.room_tenant_id ?? UNASSIGNED_OPTION}
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                room_tenant_id: value === UNASSIGNED_OPTION ? null : Number(value),
              }))
            }
          />
          <SelectField
            error={fieldErrors.room_device_id}
            label="Device"
            options={deviceOptions}
            selectedValue={form.room_device_id ?? UNASSIGNED_OPTION}
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                room_device_id: value === UNASSIGNED_OPTION ? null : Number(value),
              }))
            }
          />
          <SelectField
            error={fieldErrors.room_status}
            label="Status"
            options={[
              { label: formatDisplayLabel('available'), value: 'available' as const },
              { label: formatDisplayLabel('occupied'), value: 'occupied' as const },
            ]}
            selectedValue={form.room_status}
            onSelect={(value) => setForm((current) => ({ ...current, room_status: value }))}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              label={editingRoomId ? 'Update room' : 'Create room'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
            {editingRoomId && canDeleteEditingRoom ? (
              <Button
                label="Delete room"
                loading={deleting}
                onPress={() => void handleDeleteRoom()}
                variant="danger"
              />
            ) : null}
            <Button label="Cancel" onPress={closeFormModal} variant="ghost" />
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
  buttonRow: {
    gap: 10,
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
  successText: {
    color: theme.colors.success,
    fontWeight: '600',
  },
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
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
  listCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  listCardFirst: {
    borderWidth: 1,
  },
  listHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(79,163,181,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeMuted: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.overlayStrong,
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaCard: {
    flex: 1,
    minWidth: 150,
    minHeight: 72,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayMedium,
    backgroundColor: theme.colors.surface,
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
    fontSize: 15,
    fontWeight: '700',
  },
  actionRow: {
    paddingTop: 4,
  },
});

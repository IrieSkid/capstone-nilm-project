import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { Device, Room, UsersPayload } from '@/src/types/models';
import { getErrorMessage, getFieldErrors, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const UNASSIGNED_OPTION = 'unassigned';

const initialForm = {
  room_name: '',
  room_tenant_id: null as number | null,
  room_device_id: null as number | null,
  room_rate_per_kwh: '12.00',
  room_status: 'available' as 'available' | 'occupied',
};

type RoomFieldErrors = Partial<
  Record<'room_name' | 'room_tenant_id' | 'room_device_id' | 'room_rate_per_kwh' | 'room_status', string>
>;

export default function RoomsScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RoomFieldErrors>({});

  const loadData = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setLoading(true);
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
        room_tenant_id: form.room_tenant_id,
        room_device_id: form.room_device_id,
        room_rate_per_kwh: parsedRate,
        room_status: form.room_status,
      };

      if (editingRoomId) {
        await apiRequest(`/rooms/${editingRoomId}`, {
          method: 'PATCH',
          token,
          body,
        });
        setMessage('Room updated successfully.');
        successTitle = 'Room updated';
        successMessage = 'The room details and assignments were saved successfully.';
      } else {
        await apiRequest('/rooms', {
          method: 'POST',
          token,
          body,
        });
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

  const tenantOptions: Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }> = [
    { label: 'Unassigned tenant', value: UNASSIGNED_OPTION },
    ...(
      usersPayload?.users
        .filter((user) => user.roleName === 'tenant' && !unavailableTenantIds.has(user.userId))
        .map((user) => ({
          label: user.userName,
          value: user.userId,
        })) || []
    ),
  ];

  const deviceOptions: Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }> = [
    { label: 'Unassigned device', value: UNASSIGNED_OPTION },
    ...devices.map((device) => ({
      label: `${device.deviceIdentifier ?? 'No identifier'}${device.roomName ? ` • ${device.roomName}` : ''}`,
      value: device.deviceId,
    })),
  ];
  const editingRoom = editingRoomId !== null
    ? rooms.find((room) => room.roomId === editingRoomId) ?? null
    : null;
  const canDeleteEditingRoom = Boolean(
    editingRoom &&
      editingRoom.roomStatus === 'available' &&
      editingRoom.tenantId === null &&
      editingRoom.deviceId === null,
  );

  return (
    <RequireRole roles={['admin']}>
      <ScreenShell
        subtitle="Create rooms first, then optionally assign tenants and devices whenever they are ready."
        title="Room Management">
        <SectionCard>
          <Text style={styles.sectionTitle}>Room actions</Text>
          <Text style={styles.helperText}>
            Create empty rooms now, then update tenant and device assignments later as occupancy changes.
          </Text>
          <Text style={styles.helperText}>
            Delete is only allowed for rooms that are available and have no assigned tenant or device.
          </Text>
          {error && !isFormModalVisible ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          <Button label="Create room" onPress={openCreateModal} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Configured rooms</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : rooms.length ? (
            rooms.map((room) => (
              <View key={room.roomId} style={styles.listItem}>
                <Text style={styles.itemTitle}>{room.roomName}</Text>
                <Text style={styles.helperText}>
                  {room.tenantName ?? 'Unassigned tenant'} • {room.deviceIdentifier ?? 'Unassigned device'}
                </Text>
                <Text style={styles.helperText}>
                  Rate: {formatCurrency(room.roomRatePerKwh)} / kWh • Status: {room.roomStatus}
                </Text>
                <Button label="Edit room" onPress={() => startEdit(room)} variant="ghost" />
              </View>
            ))
          ) : (
            <EmptyState
              description="Create rooms even before a tenant moves in or a device is installed."
              title="No rooms yet"
            />
          )}
        </SectionCard>

        <FormModal
          onClose={closeFormModal}
          subtitle="Set the room name, rate, and status. Tenant and device assignments can stay unassigned."
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
          <Text style={styles.label}>Tenant</Text>
          <OptionChips
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                room_tenant_id: value === UNASSIGNED_OPTION ? null : Number(value),
              }))
            }
            options={tenantOptions}
            selectedValue={form.room_tenant_id ?? UNASSIGNED_OPTION}
          />
          {fieldErrors.room_tenant_id ? <Text style={styles.errorText}>{fieldErrors.room_tenant_id}</Text> : null}
          <Text style={styles.label}>Device</Text>
          <OptionChips
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                room_device_id: value === UNASSIGNED_OPTION ? null : Number(value),
              }))
            }
            options={deviceOptions}
            selectedValue={form.room_device_id ?? UNASSIGNED_OPTION}
          />
          {fieldErrors.room_device_id ? <Text style={styles.errorText}>{fieldErrors.room_device_id}</Text> : null}
          <Text style={styles.label}>Status</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, room_status: value }))}
            options={[
              { label: 'available', value: 'available' as const },
              { label: 'occupied', value: 'occupied' as const },
            ]}
            selectedValue={form.room_status}
          />
          {fieldErrors.room_status ? <Text style={styles.errorText}>{fieldErrors.room_status}</Text> : null}
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
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
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
  listItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: 14,
    gap: 6,
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
});

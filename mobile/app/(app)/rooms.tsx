import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAuth } from '@/src/context/AuthContext';
import { Device, Room, UsersPayload } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const initialForm = {
  room_name: '',
  room_tenant_id: null as number | null,
  room_device_id: null as number | null,
  room_rate_per_kwh: '12.00',
  room_status: 'occupied' as 'available' | 'occupied',
};

export default function RoomsScreen() {
  const { token, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

    if (!form.room_name.trim() || form.room_tenant_id === null || form.room_device_id === null) {
      setError('Room name, tenant, and device are required.');
      return;
    }

    const parsedRate = Number(form.room_rate_per_kwh);

    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Enter a valid room rate per kWh.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

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
      } else {
        await apiRequest('/rooms', {
          method: 'POST',
          token,
          body,
        });
        setMessage('Room created successfully.');
      }

      setEditingRoomId(null);
      setForm(initialForm);
      await loadData();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save room.'));
    } finally {
      setSaving(false);
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
    setMessage(null);
  }

  function resetForm() {
    setEditingRoomId(null);
    setForm(initialForm);
    setError(null);
    setMessage(null);
  }

  const tenantOptions =
    usersPayload?.users
      .filter((user) => user.roleName === 'tenant')
      .map((user) => ({
        label: user.userName,
        value: user.userId,
      })) || [];

  const deviceOptions = devices.map((device) => ({
    label: `${device.deviceIdentifier}${device.roomName ? ` • ${device.roomName}` : ''}`,
    value: device.deviceId,
  }));

  return (
    <RequireRole roles={['admin']}>
      <ScreenShell
        subtitle="Assign a tenant and a registered device to each room, then set the rate per kWh."
        title="Room Management">
        <SectionCard>
          <Text style={styles.sectionTitle}>
            {editingRoomId ? 'Update room assignment' : 'Create room assignment'}
          </Text>
          <Field
            label="Room name"
            onChangeText={(value) => setForm((current) => ({ ...current, room_name: value }))}
            placeholder="Room 101"
            value={form.room_name}
          />
          <Field
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
            onSelect={(value) => setForm((current) => ({ ...current, room_tenant_id: value }))}
            options={tenantOptions}
            selectedValue={form.room_tenant_id}
          />
          <Text style={styles.label}>Device</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, room_device_id: value }))}
            options={deviceOptions}
            selectedValue={form.room_device_id}
          />
          <Text style={styles.label}>Status</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, room_status: value }))}
            options={[
              { label: 'occupied', value: 'occupied' as const },
              { label: 'available', value: 'available' as const },
            ]}
            selectedValue={form.room_status}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              label={editingRoomId ? 'Update room' : 'Create room'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
            {editingRoomId ? <Button label="Cancel edit" onPress={resetForm} variant="ghost" /> : null}
          </View>
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
                  {room.tenantName} · {room.deviceIdentifier}
                </Text>
                <Text style={styles.helperText}>
                  Rate: {formatCurrency(room.roomRatePerKwh)} / kWh · Status: {room.roomStatus}
                </Text>
                <Button label="Edit room" onPress={() => startEdit(room)} variant="ghost" />
              </View>
            ))
          ) : (
            <EmptyState
              description="Create room-to-tenant and room-to-device mappings so readings resolve correctly."
              title="No rooms yet"
            />
          )}
        </SectionCard>
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

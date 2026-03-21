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
import { Device } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const initialForm = {
  device_name: '',
  device_identifier: '',
  device_status: 'offline' as 'online' | 'offline',
};

export default function DevicesScreen() {
  const { token, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<Device[]>('/devices', { token });
      setDevices(data);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load devices.'));
    } finally {
      setLoading(false);
    }
  }, [logout, token]);

  useFocusEffect(
    useCallback(() => {
      loadDevices();
    }, [loadDevices]),
  );

  async function handleSubmit() {
    if (!token) {
      return;
    }

    if (!form.device_name.trim() || !form.device_identifier.trim()) {
      setError('Device name and identifier are required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      if (editingDeviceId) {
        await apiRequest(`/devices/${editingDeviceId}`, {
          method: 'PATCH',
          token,
          body: {
            device_name: form.device_name.trim(),
            device_identifier: form.device_identifier.trim(),
            device_status: form.device_status,
          },
        });
        setMessage('Device updated successfully.');
      } else {
        await apiRequest('/devices', {
          method: 'POST',
          token,
          body: {
            device_name: form.device_name.trim(),
            device_identifier: form.device_identifier.trim(),
            device_status: form.device_status,
          },
        });
        setMessage('Device created successfully.');
      }

      setEditingDeviceId(null);
      setForm(initialForm);
      await loadDevices();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save device.'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(device: Device) {
    setEditingDeviceId(device.deviceId);
    setForm({
      device_name: device.deviceName,
      device_identifier: device.deviceIdentifier,
      device_status: device.deviceStatus,
    });
    setError(null);
    setMessage(null);
  }

  function resetForm() {
    setEditingDeviceId(null);
    setForm(initialForm);
    setError(null);
    setMessage(null);
  }

  return (
    <RequireRole roles={['admin']}>
      <ScreenShell
        subtitle="Register device identifiers, keep them unique, and track whether they are online."
        title="Device Registry">
        <SectionCard>
          <Text style={styles.sectionTitle}>
            {editingDeviceId ? 'Update device' : 'Register new device'}
          </Text>
          <Field
            label="Device name"
            onChangeText={(value) => setForm((current) => ({ ...current, device_name: value }))}
            placeholder="ESP32 Room 101"
            value={form.device_name}
          />
          <Field
            autoCapitalize="characters"
            label="Device identifier"
            onChangeText={(value) =>
              setForm((current) => ({ ...current, device_identifier: value.toUpperCase() }))
            }
            placeholder="DEV-101"
            value={form.device_identifier}
          />
          <Text style={styles.label}>Status</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, device_status: value }))}
            options={[
              { label: 'online', value: 'online' as const },
              { label: 'offline', value: 'offline' as const },
            ]}
            selectedValue={form.device_status}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              label={editingDeviceId ? 'Update device' : 'Create device'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
            {editingDeviceId ? (
              <Button label="Cancel edit" onPress={resetForm} variant="ghost" />
            ) : null}
          </View>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Registered devices</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : devices.length ? (
            devices.map((device) => (
              <View key={device.deviceId} style={styles.listItem}>
                <Text style={styles.itemTitle}>{device.deviceName}</Text>
                <Text style={styles.helperText}>
                  {device.deviceIdentifier} · {device.deviceStatus}
                </Text>
                <Text
                  style={[
                    styles.statusText,
                    device.computedStatus === 'online' ? styles.online : styles.offline,
                  ]}>
                  {device.computedStatus.toUpperCase()}
                </Text>
                <Text style={styles.helperText}>
                  Assigned room: {device.roomName || 'Not assigned'}
                </Text>
                <Text style={styles.helperText}>
                  Last seen: {formatDateTime(device.deviceLastSeen)}
                </Text>
                <Button label="Edit device" onPress={() => startEdit(device)} variant="ghost" />
              </View>
            ))
          ) : (
            <EmptyState
              description="Register the device identifiers that will post energy readings."
              title="No devices yet"
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
  statusText: {
    fontWeight: '800',
  },
  online: {
    color: theme.colors.success,
  },
  offline: {
    color: theme.colors.danger,
  },
});

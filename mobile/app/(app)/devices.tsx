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
import { Device, UsersPayload } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime, formatDisplayLabel, formatDuration } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const UNASSIGNED_OPTION = 'unassigned';
const ALL_OWNERS_OPTION = 'all';
const ADMIN_INVENTORY_OPTION = 'admin_inventory';
const LANDLORD_OWNED_OPTION = 'landlord_owned';
const ALL_PLACEMENTS_OPTION = 'all';
const INSTALLED_OPTION = 'installed';
const INVENTORY_OPTION = 'inventory';

const initialForm = {
  device_name: '',
  device_identifier: '',
  device_owner_landlord_id: null as number | null,
  device_status: 'offline' as 'online' | 'offline',
};

export default function DevicesScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [placementFilter, setPlacementFilter] = useState<
    typeof ALL_PLACEMENTS_OPTION | typeof INSTALLED_OPTION | typeof INVENTORY_OPTION
  >(ALL_PLACEMENTS_OPTION);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL_OWNERS_OPTION);

  const loadDevices = useCallback(async (options?: { pullToRefresh?: boolean }) => {
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
      const [devicesData, usersData] = await Promise.all([
        apiRequest<Device[]>('/devices', { token }),
        apiRequest<UsersPayload>('/users', { token }),
      ]);
      setDevices(devicesData);
      setUsersPayload(usersData);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load devices.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
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
      const nextError = 'Device name and identifier are required.';
      setError(nextError);
      showError('Unable to save device', nextError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      let successTitle = '';
      let successMessage = '';

      if (editingDeviceId) {
        await apiRequest(`/devices/${editingDeviceId}`, {
          method: 'PATCH',
          token,
          body: {
            device_name: form.device_name.trim(),
            device_identifier: form.device_identifier.trim(),
            device_owner_landlord_id: form.device_owner_landlord_id,
            device_status: form.device_status,
          },
        });
        setMessage('Device updated successfully.');
        successTitle = 'Device updated';
        successMessage = 'The device details were saved successfully.';
      } else {
        await apiRequest('/devices', {
          method: 'POST',
          token,
          body: {
            device_name: form.device_name.trim(),
            device_identifier: form.device_identifier.trim(),
            device_owner_landlord_id: form.device_owner_landlord_id,
            device_status: form.device_status,
          },
        });
        setMessage('Device created successfully.');
        successTitle = 'Device created';
        successMessage = 'The device is now ready to be assigned to a room.';
      }

      closeFormModal();
      await loadDevices();
      showSuccess(successTitle, successMessage);
    } catch (submitError) {
      const nextError = getErrorMessage(submitError, 'Unable to save device.');
      setError(nextError);
      showError('Unable to save device', nextError);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(device: Device) {
    setEditingDeviceId(device.deviceId);
    setForm({
      device_name: device.deviceName,
      device_identifier: device.deviceIdentifier,
      device_owner_landlord_id: device.deviceOwnerLandlordId,
      device_status: device.deviceStatus,
    });
    setError(null);
    setMessage(null);
    setIsFormModalVisible(true);
  }

  function closeFormModal() {
    setEditingDeviceId(null);
    setForm(initialForm);
    setError(null);
    setIsFormModalVisible(false);
  }

  function openCreateModal() {
    setEditingDeviceId(null);
    setForm(initialForm);
    setError(null);
    setMessage(null);
    setIsFormModalVisible(true);
  }

  const filteredDevices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return devices.filter((device) => {
      const matchesSearch =
        !normalizedSearch
        || [
          device.deviceName,
          device.deviceIdentifier,
          device.roomName ?? '',
          device.tenantName ?? '',
          device.landlordName ?? '',
          device.deviceOwnerLandlordName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesConnection =
        connectionFilter === 'all' || device.computedStatus === connectionFilter;
      const matchesPlacement =
        placementFilter === ALL_PLACEMENTS_OPTION
        || (placementFilter === INSTALLED_OPTION ? Boolean(device.roomId) : !device.roomId);
      const matchesOwner =
        ownerFilter === ALL_OWNERS_OPTION
        || (ownerFilter === ADMIN_INVENTORY_OPTION
          ? device.deviceOwnerLandlordId === null
          : ownerFilter === LANDLORD_OWNED_OPTION
            ? device.deviceOwnerLandlordId !== null
            : device.deviceOwnerLandlordId === Number(ownerFilter.replace('landlord:', '')));

      return matchesSearch && matchesConnection && matchesPlacement && matchesOwner;
    });
  }, [connectionFilter, devices, ownerFilter, placementFilter, searchTerm]);

  const summaryItems = useMemo(() => [
    { label: 'Total devices', value: String(devices.length) },
    {
      label: 'Handed to landlord',
      value: String(devices.filter((device) => device.deviceOwnerLandlordId !== null).length),
    },
    {
      label: 'Online',
      value: String(devices.filter((device) => device.computedStatus === 'online').length),
    },
    {
      label: 'Assigned',
      value: String(devices.filter((device) => device.roomId !== null).length),
    },
    { label: 'Unassigned', value: String(devices.filter((device) => device.roomId === null).length) },
  ], [devices]);

  const landlordOptions: Array<{ label: string; value: number | typeof UNASSIGNED_OPTION }> = [
    { label: 'Admin inventory / unassigned owner', value: UNASSIGNED_OPTION },
    ...(
      usersPayload?.users
        .filter((user) => user.roleName === 'landlord')
        .map((user) => ({
          label: user.userName,
          value: user.userId,
        })) || []
    ),
  ];

  const ownerFilterOptions: Array<{ label: string; value: string }> = [
    { label: 'All owners', value: ALL_OWNERS_OPTION },
    { label: 'Admin inventory only', value: ADMIN_INVENTORY_OPTION },
    { label: 'Landlord-owned only', value: LANDLORD_OWNED_OPTION },
    ...(
      usersPayload?.users
        .filter((user) => user.roleName === 'landlord')
        .map((user) => ({
          label: user.userName,
          value: `landlord:${user.userId}`,
        })) || []
    ),
  ];

  return (
    <RequireRole roles={['admin']} permissionKey="devices.view">
      <ScreenShell
        onRefresh={() => void loadDevices({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Register device identifiers, keep them unique, and quickly spot which devices are online or still unassigned."
        title="Device Registry">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Use this view to see device coverage at a glance before opening the full list.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <Text style={styles.helperText}>
            Use this when you need to register a device before reviewing or filtering the current list.
          </Text>
          <View style={styles.actionRow}>
            <Button label="Add device" onPress={openCreateModal} />
          </View>
          {error && !isFormModalVisible ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Find and manage</Text>
          <Text style={styles.helperText}>
            Search by device, owner, room, tenant, or landlord, then narrow the list by handoff owner, placement, and connection state.
          </Text>
          <Field
            autoCapitalize="characters"
            label="Search devices"
            onChangeText={setSearchTerm}
            placeholder="Search name, identifier, owner, room, tenant, or landlord"
            value={searchTerm}
          />
          <View style={styles.filterRow}>
            <View style={styles.filterItem}>
              <SelectField
                label="Owner filter"
                options={ownerFilterOptions}
                selectedValue={ownerFilter}
                onSelect={(value) => setOwnerFilter(String(value))}
              />
            </View>
            <View style={styles.filterItem}>
              <SelectField
                label="Placement filter"
                options={[
                  { label: 'All placements', value: ALL_PLACEMENTS_OPTION },
                  { label: 'Installed in room', value: INSTALLED_OPTION },
                  { label: 'Inventory only', value: INVENTORY_OPTION },
                ]}
                selectedValue={placementFilter}
                onSelect={(value) =>
                  setPlacementFilter(
                    value as
                      | typeof ALL_PLACEMENTS_OPTION
                      | typeof INSTALLED_OPTION
                      | typeof INVENTORY_OPTION,
                  )
                }
              />
            </View>
            <View style={styles.filterItem}>
              <SelectField
                label="Connection filter"
                options={[
                  { label: 'All devices', value: 'all' as const },
                  { label: formatDisplayLabel('online'), value: 'online' as const },
                  { label: formatDisplayLabel('offline'), value: 'offline' as const },
                ]}
                selectedValue={connectionFilter}
                onSelect={(value) => setConnectionFilter(value as 'all' | 'online' | 'offline')}
              />
            </View>
          </View>
          <Text style={styles.helperText}>
            Use owner filters when handing off devices to landlords, and placement filters when checking what is already installed versus still in inventory.
          </Text>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Registered devices</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredDevices.length} of {devices.length} devices.
            </Text>
          ) : null}
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : filteredDevices.length ? (
            filteredDevices.map((device, index) => (
              <View
                key={device.deviceId}
                style={[styles.listCard, index === 0 ? styles.listCardFirst : null]}>
                <View style={styles.listHeader}>
                  <Text style={styles.itemTitle}>{device.deviceName}</Text>
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.badge,
                        device.computedStatus === 'online' ? styles.badgeOnline : styles.badgeOffline,
                      ]}>
                      <Text style={styles.badgeText}>{formatDisplayLabel(device.computedStatus)}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeMuted]}>
                      <Text style={styles.badgeText}>
                        {device.roomId ? 'Assigned' : 'Unassigned'}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.identifierText}>{device.deviceIdentifier}</Text>
                <Text style={styles.helperText}>
                  Owner landlord: {device.deviceOwnerLandlordName ?? 'Admin inventory / not handed off'}
                </Text>
                <Text style={styles.helperText}>
                  Room: {device.roomName ?? 'Not assigned yet'}
                </Text>
                <Text style={styles.helperText}>
                  Tenant: {device.tenantName ?? 'Unassigned tenant'}
                </Text>
                <Text style={styles.helperText}>
                  Landlord: {device.landlordName ?? 'Unassigned landlord'}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>Last seen</Text>
                    <Text style={styles.metaValue}>{formatDateTime(device.deviceLastSeen)}</Text>
                  </View>
                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>Uptime</Text>
                    <Text style={styles.metaValue}>
                      {device.deviceUptimeSeconds !== null
                        ? formatDuration(device.deviceUptimeSeconds)
                        : 'Offline'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.helperText}>
                  Configured status: {formatDisplayLabel(device.deviceStatus)}
                </Text>
                <View style={styles.actionRow}>
                  <Button label="Edit device" onPress={() => startEdit(device)} variant="ghost" />
                </View>
              </View>
            ))
          ) : (
            <EmptyState
              description={
                devices.length
                  ? 'Try a different search or filter to find the device you need.'
                  : 'Register the device identifiers that will post energy readings.'
              }
              title={devices.length ? 'No matching devices' : 'No devices yet'}
            />
          )}
        </SectionCard>

        <FormModal
          onClose={closeFormModal}
          subtitle="Set the device name, unique identifier, and status only when you need to create or edit a device."
          title={editingDeviceId ? 'Update device' : 'Register new device'}
          visible={isFormModalVisible}>
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
          <SelectField
            label="Owner landlord"
            options={landlordOptions}
            selectedValue={form.device_owner_landlord_id ?? UNASSIGNED_OPTION}
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                device_owner_landlord_id: value === UNASSIGNED_OPTION ? null : Number(value),
              }))
            }
          />
          <SelectField
            label="Status"
            options={[
              { label: formatDisplayLabel('online'), value: 'online' as const },
              { label: formatDisplayLabel('offline'), value: 'offline' as const },
            ]}
            selectedValue={form.device_status}
            onSelect={(value) => setForm((current) => ({ ...current, device_status: value }))}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              label={editingDeviceId ? 'Update device' : 'Add device'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
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
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
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
  identifierText: {
    color: theme.colors.secondary,
    fontSize: 14,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeOnline: {
    backgroundColor: 'rgba(63,191,127,0.14)',
    borderColor: theme.colors.success,
  },
  badgeOffline: {
    backgroundColor: 'rgba(224,93,93,0.14)',
    borderColor: theme.colors.danger,
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

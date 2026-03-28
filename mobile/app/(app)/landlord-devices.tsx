import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { SelectField } from '@/src/components/SelectField';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAuth } from '@/src/context/AuthContext';
import { LandlordDeviceRecord } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime, formatDisplayLabel, formatDuration, formatNumber } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

export default function LandlordDevicesScreen() {
  const { token, logout } = useAuth();
  const [devices, setDevices] = useState<LandlordDeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

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
      const nextDevices = await apiRequest<LandlordDeviceRecord[]>('/landlord/devices', { token });
      setDevices(nextDevices);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load landlord devices.'));
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

  const filteredDevices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return devices.filter((device) => {
      const matchesSearch =
        !normalizedSearch
        || [
          device.deviceName,
          device.deviceIdentifier,
          device.roomName,
          device.tenantName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesStatus = statusFilter === 'all' || device.computedStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [devices, searchTerm, statusFilter]);

  const summaryItems = useMemo(() => [
    { label: 'Total devices', value: String(devices.length) },
    {
      label: 'Online',
      value: String(devices.filter((device) => device.computedStatus === 'online').length),
    },
    {
      label: 'Offline',
      value: String(devices.filter((device) => device.computedStatus === 'offline').length),
    },
    {
      label: 'Installed in room',
      value: String(devices.filter((device) => device.roomId !== null).length),
    },
    {
      label: 'Available inventory',
      value: String(devices.filter((device) => device.roomId === null).length),
    },
  ], [devices]);

  return (
    <RequireRole roles={['landlord']} permissionKey="landlord.devices.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Review the devices under your ownership, whether already installed in rooms or still available as inventory."
        title="My Devices">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Use this view to quickly spot which owned devices are installed, which are still available, and which ones need follow-up.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Find devices</Text>
          <Text style={styles.helperText}>
            Search by device, room, or tenant and filter by live connection state.
          </Text>
          <Field
            autoCapitalize="characters"
            label="Search devices"
            onChangeText={setSearchTerm}
            placeholder="Search device, room, or tenant"
            value={searchTerm}
          />
          <SelectField
            label="Status filter"
            options={[
              { label: 'All devices', value: 'all' as const },
              { label: formatDisplayLabel('online'), value: 'online' as const },
              { label: formatDisplayLabel('offline'), value: 'offline' as const },
            ]}
            selectedValue={statusFilter}
            onSelect={(value) => setStatusFilter(value as 'all' | 'online' | 'offline')}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Assigned devices</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredDevices.length} of {devices.length} devices.
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
          {!loading && !error && filteredDevices.length === 0 ? (
            <EmptyState
              description={
                devices.length
                  ? 'Try a different search or filter to find the device you need.'
                  : 'Device records will appear here once rooms you own are linked to registered devices.'
              }
              title={devices.length ? 'No matching devices' : 'No devices assigned yet'}
            />
          ) : null}
          {!loading && !error
            ? filteredDevices.map((device, index) => (
                <View
                  key={device.deviceId}
                  style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
                  <View style={styles.listHeader}>
                    <Text style={styles.itemTitle}>{device.deviceName}</Text>
                    <View
                      style={[
                        styles.badge,
                        device.computedStatus === 'online' ? styles.badgeOnline : styles.badgeOffline,
                      ]}>
                      <Text style={styles.badgeText}>{formatDisplayLabel(device.computedStatus)}</Text>
                    </View>
                  </View>
                  <Text style={styles.identifierText}>{device.deviceIdentifier}</Text>
                  <Text style={styles.helperText}>
                    Room: {device.roomName ?? 'Not assigned yet'} - {device.tenantName ?? 'No tenant assigned'}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Latest power</Text>
                      <Text style={styles.metaValue}>{formatNumber(device.latestPowerW, 'W')}</Text>
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
                    Last seen: {formatDateTime(device.deviceLastSeen)}
                  </Text>
                </View>
              ))
            : null}
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
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
  listItem: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  listItemFirst: {
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
});

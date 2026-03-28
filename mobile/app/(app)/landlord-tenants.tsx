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
import { LandlordTenantRecord } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency, formatDateTime, formatNumber } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

export default function LandlordTenantsScreen() {
  const { token, logout } = useAuth();
  const [tenants, setTenants] = useState<LandlordTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'no_reading'>('all');

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
      const nextTenants = await apiRequest<LandlordTenantRecord[]>('/landlord/tenants', { token });
      setTenants(nextTenants);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load landlord tenants.'));
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

  const filteredTenants = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return tenants.filter((tenant) => {
      const hasReading = Boolean(tenant.latestReadingAt);
      const matchesSearch =
        !normalizedSearch
        || [
          tenant.tenantName,
          tenant.tenantEmail,
          tenant.tenantPhone ?? '',
          tenant.roomName,
          tenant.deviceIdentifier ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesActivity =
        activityFilter === 'all'
        || (activityFilter === 'active' ? hasReading : !hasReading);

      return matchesSearch && matchesActivity;
    });
  }, [activityFilter, searchTerm, tenants]);

  const summaryItems = useMemo(() => {
    const activeCount = tenants.filter((tenant) => tenant.latestReadingAt).length;
    const withDeviceCount = tenants.filter((tenant) => tenant.deviceIdentifier).length;
    const totalEstimate = tenants.reduce(
      (sum, tenant) => sum + (tenant.estimatedMonthlyCost ?? 0),
      0,
    );

    return [
      { label: 'Total tenants', value: String(tenants.length) },
      { label: 'With live reading', value: String(activeCount) },
      { label: 'With device', value: String(withDeviceCount) },
      { label: 'Monthly total', value: formatCurrency(totalEstimate) },
    ];
  }, [tenants]);

  return (
    <RequireRole roles={['landlord']} permissionKey="landlord.tenants.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Review the approved tenants assigned to your rooms and quickly spot who has live readings and estimated cost activity."
        title="My Tenants">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Use this view to scan active tenant assignments before opening each room.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Find tenants</Text>
          <Text style={styles.helperText}>
            Search by tenant, room, device, or contact details to narrow the list quickly.
          </Text>
          <Field
            autoCapitalize="words"
            label="Search tenants"
            onChangeText={setSearchTerm}
            placeholder="Search tenant, room, device, email, or phone"
            value={searchTerm}
          />
          <SelectField
            label="Activity filter"
            options={[
              { label: 'All tenants', value: 'all' as const },
              { label: 'With live reading', value: 'active' as const },
              { label: 'No readings yet', value: 'no_reading' as const },
            ]}
            selectedValue={activityFilter}
            onSelect={(value) => setActivityFilter(value as 'all' | 'active' | 'no_reading')}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Tenant list</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredTenants.length} of {tenants.length} tenants.
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
          {!loading && !error && filteredTenants.length === 0 ? (
            <EmptyState
              description={
                tenants.length
                  ? 'Try a different search or filter to find the tenant you need.'
                  : 'Approved tenant assignments will appear here once tenants are assigned to rooms you own.'
              }
              title={tenants.length ? 'No matching tenants' : 'No tenants assigned yet'}
            />
          ) : null}
          {!loading && !error
            ? filteredTenants.map((tenant, index) => (
                <View
                  key={`${tenant.tenantId}-${tenant.roomId}`}
                  style={[styles.listItem, index === 0 ? styles.listItemFirst : null]}>
                  <View style={styles.listHeader}>
                    <Text style={styles.itemTitle}>{tenant.tenantName}</Text>
                    <View style={[styles.badge, tenant.latestReadingAt ? styles.badgeActive : styles.badgeMuted]}>
                      <Text style={styles.badgeText}>
                        {tenant.latestReadingAt ? 'Live reading' : 'No reading yet'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.helperText}>{tenant.tenantEmail}</Text>
                  <Text style={styles.helperText}>{tenant.tenantPhone || 'No phone number provided'}</Text>
                  <Text style={styles.roomIdentityText}>
                    {tenant.roomName} - {tenant.deviceIdentifier ?? 'No device assigned'}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Current power</Text>
                      <Text style={styles.metaValue}>{formatNumber(tenant.currentPowerUsage, 'W')}</Text>
                    </View>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Monthly estimate</Text>
                      <Text style={styles.metaValue}>{formatCurrency(tenant.estimatedMonthlyCost)}</Text>
                    </View>
                  </View>
                  <Text style={styles.helperText}>
                    Last reading: {formatDateTime(tenant.latestReadingAt)}
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
  roomIdentityText: {
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
  badgeActive: {
    backgroundColor: 'rgba(63,191,127,0.14)',
    borderColor: theme.colors.success,
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
});

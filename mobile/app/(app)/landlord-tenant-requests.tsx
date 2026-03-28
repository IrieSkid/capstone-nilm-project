import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { hasModuleAccess } from '@/src/utils/access';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { LandlordPendingTenantRequest } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime, formatStatusLabel } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

function isSameLocalDay(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
}

export default function LandlordTenantRequestsScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout, user } = useAuth();
  const [requests, setRequests] = useState<LandlordPendingTenantRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const canApprove = Boolean(user && hasModuleAccess(user, 'landlord.tenant_requests.approve'));

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
      const nextRequests = await apiRequest<LandlordPendingTenantRequest[]>('/landlord/tenant-requests', { token });
      setRequests(nextRequests);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load pending tenant requests.'));
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

  async function handleRequestAction(tenantId: number, action: 'approve' | 'reject') {
    if (!token || !canApprove) {
      return;
    }

    try {
      setActiveTenantId(tenantId);
      const nextRequests = await apiRequest<LandlordPendingTenantRequest[]>(
        `/landlord/tenant-requests/${tenantId}/${action}`,
        {
          method: 'PATCH',
          token,
        },
      );

      setRequests(nextRequests);
      showSuccess(
        action === 'approve' ? 'Tenant approved' : 'Tenant rejected',
        action === 'approve'
          ? 'The tenant can now sign in and be assigned to your rooms.'
          : 'The tenant registration request was rejected successfully.',
      );
    } catch (requestError) {
      if (isUnauthorized(requestError)) {
        await logout();
        return;
      }

      showError(
        action === 'approve' ? 'Unable to approve tenant' : 'Unable to reject tenant',
        getErrorMessage(requestError, 'Unable to update tenant request.'),
      );
    } finally {
      setActiveTenantId(null);
    }
  }

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return requests.filter((request) =>
      !normalizedSearch
      || [
        request.tenantName,
        request.tenantEmail,
        request.tenantPhone ?? '',
        request.landlordOwnerName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [requests, searchTerm]);

  const summaryItems = useMemo(
    () => [
      { label: 'Pending requests', value: String(requests.length) },
      {
        label: 'With phone',
        value: String(requests.filter((request) => Boolean(request.tenantPhone)).length),
      },
      {
        label: 'Requested today',
        value: String(requests.filter((request) => isSameLocalDay(request.createdAt)).length),
      },
      { label: 'Approval access', value: canApprove ? 'Enabled' : 'View only' },
    ],
    [canApprove, requests],
  );

  return (
    <RequireRole roles={['landlord']} permissionKey="landlord.tenant_requests.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Review new tenant registrations linked to your invite code and decide who should be allowed into your property account."
        title="Tenant Requests">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Start here to see how many pending registrations are waiting for your decision.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Find requests</Text>
          <Text style={styles.helperText}>
            Search by tenant name, email, or phone before reviewing an approval request.
          </Text>
          <Field
            autoCapitalize="words"
            label="Search requests"
            onChangeText={setSearchTerm}
            placeholder="Search tenant name, email, or phone"
            value={searchTerm}
          />
          {!canApprove ? (
            <Text style={styles.helperText}>
              Approval actions are currently disabled for your landlord account by the administrator.
            </Text>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Pending approvals</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredRequests.length} of {requests.length} requests.
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
          {!loading && !error && filteredRequests.length === 0 ? (
            <EmptyState
              description={
                requests.length
                  ? 'Try a different search to find the request you need.'
                  : 'Once tenants register using your invite code, their approval requests will appear here.'
              }
              title={requests.length ? 'No matching requests' : 'No pending requests'}
            />
          ) : null}
          {!loading && !error
            ? filteredRequests.map((request, index) => (
                <View
                  key={request.tenantId}
                  style={[styles.listCard, index === 0 ? styles.listCardFirst : null]}>
                  <View style={styles.listHeader}>
                    <Text style={styles.itemTitle}>{request.tenantName}</Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>
                        {formatStatusLabel(request.statusName)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.helperText}>{request.tenantEmail}</Text>
                  <Text style={styles.helperText}>{request.tenantPhone || 'No phone number provided'}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Requested</Text>
                      <Text style={styles.metaValue}>{formatDateTime(request.createdAt)}</Text>
                    </View>
                    <View style={styles.metaCard}>
                      <Text style={styles.metaLabel}>Landlord</Text>
                      <Text style={styles.metaValue}>{request.landlordOwnerName}</Text>
                    </View>
                  </View>
                  {canApprove ? (
                    <View style={styles.buttonRow}>
                      <Button
                        label="Approve tenant"
                        loading={activeTenantId === request.tenantId}
                        onPress={() => void handleRequestAction(request.tenantId, 'approve')}
                      />
                      <Button
                        label="Reject request"
                        onPress={() => void handleRequestAction(request.tenantId, 'reject')}
                        variant="danger"
                      />
                    </View>
                  ) : null}
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
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(79,163,181,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
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
  buttonRow: {
    gap: 10,
  },
});

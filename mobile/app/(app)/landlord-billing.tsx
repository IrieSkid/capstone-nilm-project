import { useFocusEffect, useRouter } from 'expo-router';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { SelectField } from '@/src/components/SelectField';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import {
  BillingCycleRecord,
  BillingPaymentRecord,
  BillingReceiptRecord,
  BillingStatementRecord,
  LandlordBillingStatementsData,
  LandlordBillingSummary,
  LandlordCurrentBillingData,
  NotificationSummaryData,
} from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatStatusLabel } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

type BillingFilter = 'all' | 'billable' | 'needs_attention' | 'no_tenant';
type LandlordBillingTab = 'overview' | 'cycles' | 'statements' | 'payments' | 'estimates';
type DetailState =
  | { kind: 'cycle'; item: BillingCycleRecord }
  | { kind: 'statement'; item: BillingStatementRecord }
  | { kind: 'payment'; item: BillingPaymentRecord }
  | { kind: 'receipt'; item: BillingReceiptRecord }
  | null;

function getAutoCycleWindow() {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);

  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
  };
}

function getDefaultStatementDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
}

function isBillable(room: LandlordBillingSummary['rooms'][number]) {
  return Boolean(room.tenantName && room.latestReadingAt);
}

function needsAttention(room: LandlordBillingSummary['rooms'][number]) {
  return !room.tenantName || !room.deviceIdentifier || !room.latestReadingAt;
}

function hasOpenCycle(roomId: number, cycles: BillingCycleRecord[]) {
  return cycles.some((cycle) => cycle.roomId === roomId && cycle.status === 'open');
}

function getStatementTone(statement: BillingStatementRecord) {
  if (statement.status === 'draft') return styles.infoCard;
  if (statement.status === 'paid') return styles.successCard;
  if (statement.isOverdue) return styles.dangerCard;
  if (statement.isDueSoon) return styles.warningCard;
  return styles.infoCard;
}

function getPaymentTone(payment: BillingPaymentRecord) {
  if (payment.status === 'approved') return styles.successCard;
  if (payment.status === 'rejected') return styles.dangerCard;
  return styles.warningCard;
}

function TappableCard({
  children,
  onPress,
  toneStyle,
  footer,
}: {
  children: ReactNode;
  onPress: () => void;
  toneStyle?: object;
  footer?: ReactNode;
}) {
  return (
    <View style={[styles.cardShell, toneStyle]}>
      <Pressable
        android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
        onPress={onPress}
        style={({ hovered, pressed }) => [styles.cardPressable, (hovered || pressed) ? styles.cardPressableActive : null]}>
        {children}
        <View style={styles.tapHintRow}>
          <Text style={styles.tapHintText}>Tap to open details</Text>
          <Text style={styles.tapHintArrow}>{'>'}</Text>
        </View>
      </Pressable>
      {footer ? <View style={styles.cardFooter}>{footer}</View> : null}
    </View>
  );
}

export default function LandlordBillingScreen() {
  const router = useRouter();
  const { token, logout, user } = useAuth();
  const { showError, showSuccess } = useAppAlert();
  const [activeTab, setActiveTab] = useState<LandlordBillingTab>('overview');
  const [billing, setBilling] = useState<LandlordBillingSummary | null>(null);
  const [currentCycles, setCurrentCycles] = useState<LandlordCurrentBillingData | null>(null);
  const [statementData, setStatementData] = useState<LandlordBillingStatementsData | null>(null);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all');
  const [cycleModalVisible, setCycleModalVisible] = useState(false);
  const [adjustCycleModalVisible, setAdjustCycleModalVisible] = useState(false);
  const [rejectPaymentModalVisible, setRejectPaymentModalVisible] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [selectedCycleRoomName, setSelectedCycleRoomName] = useState('');
  const [selectedCycleEndDate, setSelectedCycleEndDate] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [updatingCycleId, setUpdatingCycleId] = useState<number | null>(null);
  const [closingCycleId, setClosingCycleId] = useState<number | null>(null);
  const [reopeningCycleId, setReopeningCycleId] = useState<number | null>(null);
  const [draftingCycleId, setDraftingCycleId] = useState<number | null>(null);
  const [issuingStatementId, setIssuingStatementId] = useState<number | null>(null);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState>(null);

  const canManageCycles = Boolean(user?.permissions.includes('landlord.billing.manage'));

  const loadData = useCallback(async (options?: { pullToRefresh?: boolean }) => {
    if (!token) return;

    try {
      if (options?.pullToRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);
      const [nextBilling, nextCurrentCycles, nextStatements, nextNotificationSummary] = await Promise.all([
        apiRequest<LandlordBillingSummary>('/landlord/billing', { token }),
        apiRequest<LandlordCurrentBillingData>('/landlord/billing/current-cycles', { token }),
        apiRequest<LandlordBillingStatementsData>('/landlord/billing/statements', { token }),
        apiRequest<NotificationSummaryData>('/notifications/summary', { token }),
      ]);
      setBilling(nextBilling);
      setCurrentCycles(nextCurrentCycles);
      setStatementData(nextStatements);
      setNotificationSummary(nextNotificationSummary);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load landlord billing data.'));
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

  const estimateSummaryItems = useMemo(
    () => [
      { label: 'Real-time cost/hr', value: formatCurrency(billing?.summary.totalRealtimeCostPerHour) },
      { label: 'Estimated monthly', value: formatCurrency(billing?.summary.totalEstimatedMonthlyCost) },
      { label: 'Occupied rooms', value: String(billing?.summary.occupiedRooms ?? 0) },
      { label: 'Billable rooms', value: String(billing?.summary.billableRooms ?? 0) },
    ],
    [billing?.summary.billableRooms, billing?.summary.occupiedRooms, billing?.summary.totalEstimatedMonthlyCost, billing?.summary.totalRealtimeCostPerHour],
  );

  const cycleSummaryItems = useMemo(
    () => [
      { label: 'Open cycles', value: String(currentCycles?.summary.openCycles ?? 0) },
      { label: 'Cycle-to-date kWh', value: formatNumber(currentCycles?.summary.totalCycleToDateKwh, 'kWh') },
      { label: 'Projected open cycles', value: formatCurrency(currentCycles?.summary.totalProjectedCurrentBill) },
      { label: 'Rooms without cycle', value: String(currentCycles?.summary.roomsWithoutOpenCycle ?? 0) },
    ],
    [currentCycles?.summary.openCycles, currentCycles?.summary.roomsWithoutOpenCycle, currentCycles?.summary.totalCycleToDateKwh, currentCycles?.summary.totalProjectedCurrentBill],
  );

  const statementSummaryItems = useMemo(
    () => [
      { label: 'Ready for draft', value: String(statementData?.summary.readyCycles ?? 0) },
      { label: 'Pending payments', value: String(statementData?.summary.pendingPayments ?? 0) },
      { label: 'Overdue bills', value: String(statementData?.summary.overdueStatements ?? 0) },
      { label: 'Collected amount', value: formatCurrency(statementData?.summary.collectedAmount) },
    ],
    [statementData?.summary.collectedAmount, statementData?.summary.overdueStatements, statementData?.summary.pendingPayments, statementData?.summary.readyCycles],
  );

  const filteredRooms = useMemo(() => {
    const rooms = billing?.rooms ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rooms.filter((room) => {
      const matchesSearch =
        !normalizedSearch
        || [room.roomName, room.tenantName ?? '', room.deviceIdentifier ?? ''].join(' ').toLowerCase().includes(normalizedSearch);

      const matchesFilter =
        billingFilter === 'all'
        || (billingFilter === 'billable' && isBillable(room))
        || (billingFilter === 'needs_attention' && needsAttention(room))
        || (billingFilter === 'no_tenant' && !room.tenantName);

      return matchesSearch && matchesFilter;
    });
  }, [billing?.rooms, billingFilter, searchTerm]);

  const openableRooms = useMemo(
    () => (billing?.rooms ?? []).filter((room) => room.tenantName && room.deviceIdentifier && !hasOpenCycle(room.roomId, currentCycles?.cycles ?? [])),
    [billing?.rooms, currentCycles?.cycles],
  );

  const urgentStatements = useMemo(
    () =>
      [...(statementData?.statements ?? [])]
        .filter((statement) => statement.isDueSoon || statement.isOverdue || statement.outstandingAmount > 0)
        .sort((left, right) => {
          if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
          if (left.isDueSoon !== right.isDueSoon) return left.isDueSoon ? -1 : 1;
          return right.outstandingAmount - left.outstandingAmount;
        }),
    [statementData?.statements],
  );

  function resetCycleForm() {
    setSelectedRoomId('');
  }

  function resetAdjustCycleForm() {
    setSelectedCycleId(null);
    setSelectedCycleRoomName('');
    setSelectedCycleEndDate('');
  }

  function resetRejectPaymentForm() {
    setSelectedPaymentId(null);
    setRejectionReason('');
  }

  async function handleCreateCycle() {
    if (!token || !selectedRoomId) {
      showError('Unable to open cycle', 'Select a room before opening a billing cycle.');
      return;
    }

    try {
      setCreatingCycle(true);
      await apiRequest('/landlord/billing/cycles', {
        method: 'POST',
        token,
        body: { room_id: Number(selectedRoomId) },
      });
      setCycleModalVisible(false);
      resetCycleForm();
      showSuccess('Billing cycle opened', 'The selected room now has an official monthly billing cycle starting today.');
      await loadData();
    } catch (createError) {
      showError('Unable to open cycle', getErrorMessage(createError, 'Unable to open the billing cycle.'));
    } finally {
      setCreatingCycle(false);
    }
  }

  async function handleUpdateCycleEndDate() {
    if (!token || selectedCycleId === null || !selectedCycleEndDate) {
      showError('Unable to update cycle', 'Enter a valid cycle end date in YYYY-MM-DD format.');
      return;
    }

    try {
      setUpdatingCycleId(selectedCycleId);
      await apiRequest(`/landlord/billing/cycles/${selectedCycleId}`, {
        method: 'PATCH',
        token,
        body: { period_end: selectedCycleEndDate },
      });
      setAdjustCycleModalVisible(false);
      resetAdjustCycleForm();
      showSuccess('Cycle cutoff updated', 'You can now close this cycle when the new cutoff date is reached.');
      await loadData();
    } catch (updateError) {
      showError('Unable to update cycle', getErrorMessage(updateError, 'Unable to update the cycle cutoff date.'));
    } finally {
      setUpdatingCycleId(null);
    }
  }

  async function handleCloseCycle(cycleId: number, openNextCycle = false) {
    if (!token) {
      return;
    }

    try {
      if (openNextCycle) {
        setReopeningCycleId(cycleId);
      } else {
        setClosingCycleId(cycleId);
      }

      await apiRequest(`/landlord/billing/cycles/${cycleId}/close`, {
        method: 'PATCH',
        token,
        body: { open_next_cycle: openNextCycle },
      });
      showSuccess(
        openNextCycle ? 'Cycle rolled forward' : 'Billing cycle closed',
        openNextCycle ? 'The next monthly cycle is now active.' : 'The cycle is now frozen and ready for draft generation.',
      );
      await loadData();
    } catch (closeError) {
      showError('Unable to close cycle', getErrorMessage(closeError, 'Unable to close the billing cycle.'));
    } finally {
      setClosingCycleId(null);
      setReopeningCycleId(null);
    }
  }

  async function handleGenerateDraft(cycleId: number) {
    if (!token) {
      return;
    }

    try {
      setDraftingCycleId(cycleId);
      await apiRequest(`/landlord/billing/cycles/${cycleId}/statements`, {
        method: 'POST',
        token,
        body: {},
      });
      showSuccess('Draft statement generated', 'The closed cycle is now frozen into a draft bill.');
      await loadData();
    } catch (draftError) {
      showError('Unable to generate draft', getErrorMessage(draftError, 'Unable to generate the draft statement.'));
    } finally {
      setDraftingCycleId(null);
    }
  }

  async function handleIssueStatement(statementId: number) {
    if (!token) {
      return;
    }

    try {
      setIssuingStatementId(statementId);
      await apiRequest(`/landlord/billing/statements/${statementId}/issue`, {
        method: 'PATCH',
        token,
        body: { due_date: getDefaultStatementDueDate() },
      });
      showSuccess('Bill issued', 'The tenant has been notified and the bill is now an official issued statement.');
      await loadData();
    } catch (issueError) {
      showError('Unable to issue bill', getErrorMessage(issueError, 'Unable to issue the billing statement.'));
    } finally {
      setIssuingStatementId(null);
    }
  }

  async function handleVerifyPayment(paymentId: number, action: 'approve' | 'reject', reason?: string) {
    if (!token) {
      return;
    }

    try {
      setVerifyingPaymentId(paymentId);
      await apiRequest(`/landlord/billing/payments/${paymentId}/verify`, {
        method: 'PATCH',
        token,
        body: { action, rejection_reason: reason },
      });
      if (action === 'reject') {
        setRejectPaymentModalVisible(false);
        resetRejectPaymentForm();
      }
      showSuccess(
        action === 'approve' ? 'Payment approved' : 'Payment rejected',
        action === 'approve' ? 'The tenant can now see the generated receipt.' : 'The tenant was notified about the rejection.',
      );
      await loadData();
    } catch (verifyError) {
      showError(action === 'approve' ? 'Unable to approve payment' : 'Unable to reject payment', getErrorMessage(verifyError, 'Unable to update this payment.'));
    } finally {
      setVerifyingPaymentId(null);
    }
  }

  function renderDetailContent() {
    if (!detail) {
      return null;
    }

    if (detail.kind === 'cycle') {
      const cycle = detail.item;

      return (
        <View style={styles.detailStack}>
          <View style={styles.detailGrid}>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Cycle usage</Text><Text style={styles.metaValue}>{formatNumber(cycle.cycleToDateKwh, 'kWh')}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Projected bill</Text><Text style={styles.metaValue}>{formatCurrency(cycle.projectedCurrentBill)}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Opening energy</Text><Text style={styles.metaValue}>{formatNumber(cycle.openingEnergyKwh, 'kWh')}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Latest energy</Text><Text style={styles.metaValue}>{formatNumber(cycle.latestEnergyKwh, 'kWh')}</Text></View>
          </View>
          <Text style={styles.helperText}>Period: {formatDate(cycle.periodStart)} to {formatDate(cycle.periodEnd)}</Text>
          <Text style={styles.helperText}>Tenant: {cycle.tenantName ?? 'No tenant assigned'}</Text>
          <Text style={styles.helperText}>Device: {cycle.deviceIdentifier ?? 'No device assigned'}</Text>
          <Text style={styles.helperText}>Latest power: {formatNumber(cycle.latestPowerW, 'W')}</Text>
          <Text style={styles.helperText}>Latest reading: {formatDateTime(cycle.latestReadingAt)}</Text>
        </View>
      );
    }

    if (detail.kind === 'statement') {
      const statement = detail.item;

      return (
        <View style={styles.detailStack}>
          <View style={styles.detailGrid}>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Total</Text><Text style={styles.metaValue}>{formatCurrency(statement.totalAmount)}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Outstanding</Text><Text style={styles.metaValue}>{formatCurrency(statement.outstandingAmount)}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Billed usage</Text><Text style={styles.metaValue}>{formatNumber(statement.billedKwh, 'kWh')}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Due date</Text><Text style={styles.metaValue}>{formatDate(statement.dueDate)}</Text></View>
          </View>
          <Text style={styles.helperText}>Statement: {statement.statementNumber ?? 'Draft statement'}</Text>
          <Text style={styles.helperText}>Tenant: {statement.tenantName ?? 'No tenant assigned'}</Text>
          <Text style={styles.helperText}>Approved payments: {formatCurrency(statement.approvedPaymentsAmount)}</Text>
          <Text style={styles.helperText}>Pending review: {formatCurrency(statement.pendingPaymentsAmount)}</Text>
        </View>
      );
    }

    if (detail.kind === 'payment') {
      const payment = detail.item;

      return (
        <View style={styles.detailStack}>
          <View style={styles.detailGrid}>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Amount</Text><Text style={styles.metaValue}>{formatCurrency(payment.amount)}</Text></View>
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Method</Text><Text style={styles.metaValue}>{formatStatusLabel(payment.paymentMethod)}</Text></View>
          </View>
          <Text style={styles.helperText}>Room: {payment.roomName}</Text>
          <Text style={styles.helperText}>Tenant: {payment.tenantName ?? 'Unknown tenant'}</Text>
          <Text style={styles.helperText}>Submitted: {formatDateTime(payment.submittedAt)}</Text>
          {payment.referenceNumber ? <Text style={styles.helperText}>Reference: {payment.referenceNumber}</Text> : null}
          {payment.rejectionReason ? <Text style={styles.errorText}>Rejection reason: {payment.rejectionReason}</Text> : null}
          {payment.receiptNumber ? <Text style={styles.noteText}>Receipt: {payment.receiptNumber}</Text> : null}
        </View>
      );
    }

    const receipt = detail.item;

    return (
      <View style={styles.detailStack}>
        <View style={styles.detailGrid}>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Receipt</Text><Text style={styles.metaValue}>{receipt.receiptNumber}</Text></View>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Amount</Text><Text style={styles.metaValue}>{formatCurrency(receipt.amount)}</Text></View>
        </View>
        <Text style={styles.helperText}>Room: {receipt.roomName}</Text>
        <Text style={styles.helperText}>Tenant: {receipt.tenantName ?? 'Unknown tenant'}</Text>
        <Text style={styles.helperText}>Issued: {formatDateTime(receipt.issuedAt)}</Text>
        {receipt.statementNumber ? <Text style={styles.helperText}>Statement: {receipt.statementNumber}</Text> : null}
      </View>
    );
  }

  return (
    <RequireRole roles={['landlord']} permissionKey="landlord.billing.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Manage cycle setup, official statements, payment verification, and room estimates from focused billing workspaces."
        title="Billing">
        <SectionCard>
          <Text style={styles.sectionTitle}>Billing control center</Text>
          <SummaryGrid items={estimateSummaryItems} />
          <SummaryGrid items={cycleSummaryItems} />
          <SummaryGrid items={statementSummaryItems} />
          <View style={styles.actionRow}>
            <Pressable android_ripple={{ color: 'rgba(79,163,181,0.08)' }} onPress={() => router.push('/notifications')} style={({ hovered, pressed }) => [styles.actionCard, (hovered || pressed) ? styles.actionCardActive : null]}>
              <Text style={styles.metaLabel}>Notification inbox</Text>
              <Text style={styles.actionValue}>{notificationSummary?.unreadNotifications ?? 0} unread</Text>
              <Text style={styles.helperText}>Open your notifications</Text>
            </Pressable>
            {canManageCycles ? (
              <Pressable android_ripple={{ color: 'rgba(79,163,181,0.08)' }} onPress={() => setCycleModalVisible(true)} style={({ hovered, pressed }) => [styles.actionCard, (hovered || pressed) ? styles.actionCardActive : null]}>
                <Text style={styles.metaLabel}>Open first cycle</Text>
                <Text style={styles.actionValue}>{openableRooms.length}</Text>
                <Text style={styles.helperText}>Rooms ready for official billing cycles.</Text>
              </Pressable>
            ) : null}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <OptionChips onSelect={(value) => setActiveTab(value)} options={[{ label: 'Overview', value: 'overview' }, { label: 'Cycles', value: 'cycles' }, { label: 'Statements', value: 'statements' }, { label: 'Payments', value: 'payments' }, { label: 'Estimates', value: 'estimates' }]} selectedValue={activeTab} />

        {loading ? <SectionCard><ActivityIndicator color={theme.colors.primary} /><Text style={styles.helperText}>Loading billing workspace...</Text></SectionCard> : null}

        {!loading && activeTab === 'overview' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Needs action now</Text>
            {!statementData?.pendingPayments.length && !urgentStatements.length ? (
              <EmptyState title="No urgent billing actions" description="Pending verifications and due-soon bills will surface here first." />
            ) : (
              <>
                {statementData?.pendingPayments.slice(0, 2).map((payment) => (
                  <TappableCard
                    key={payment.paymentId}
                    footer={
                      <View style={styles.footerButtons}>
                        <Button
                          label="Approve"
                          loading={verifyingPaymentId === payment.paymentId}
                          onPress={() => void handleVerifyPayment(payment.paymentId, 'approve')}
                          variant="secondary"
                        />
                        <Button
                          label="Reject"
                          loading={verifyingPaymentId === payment.paymentId}
                          onPress={() => {
                            setSelectedPaymentId(payment.paymentId);
                            setRejectionReason('');
                            setRejectPaymentModalVisible(true);
                          }}
                          variant="danger"
                        />
                      </View>
                    }
                    onPress={() => setDetail({ kind: 'payment', item: payment })}
                    toneStyle={styles.warningCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{payment.roomName}</Text>
                      <Text style={styles.badgeText}>Pending payment</Text>
                    </View>
                    <Text style={styles.helperText}>Tenant: {payment.tenantName ?? 'Unknown tenant'}</Text>
                    <Text style={styles.helperText}>
                      Amount: {formatCurrency(payment.amount)} - {formatStatusLabel(payment.paymentMethod)}
                    </Text>
                  </TappableCard>
                ))}

                {urgentStatements.slice(0, 3).map((statement) => (
                  <TappableCard
                    key={statement.statementId}
                    onPress={() => setDetail({ kind: 'statement', item: statement })}
                    toneStyle={getStatementTone(statement)}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{statement.roomName}</Text>
                      <Text style={styles.badgeText}>
                        {statement.isOverdue ? 'Overdue' : statement.isDueSoon ? 'Due soon' : formatStatusLabel(statement.status)}
                      </Text>
                    </View>
                    <Text style={styles.helperText}>Tenant: {statement.tenantName ?? 'No tenant assigned'}</Text>
                    <Text style={styles.helperText}>
                      Outstanding: {formatCurrency(statement.outstandingAmount)} - Due {formatDate(statement.dueDate)}
                    </Text>
                  </TappableCard>
                ))}
              </>
            )}
          </SectionCard>
        ) : null}

        {!loading && activeTab === 'cycles' ? (
          <>
            <SectionCard>
              <Text style={styles.sectionTitle}>Open cycles</Text>
              {!currentCycles?.cycles.length ? (
                <EmptyState title="No active cycles yet" description="Open cycles and ready-for-draft cycles will be managed here." />
              ) : (
                currentCycles.cycles.map((cycle) => (
                  <TappableCard
                    key={cycle.cycleId}
                    footer={
                      canManageCycles ? (
                        <View style={styles.footerButtons}>
                          <Button
                            label="Adjust cutoff"
                            onPress={() => {
                              setSelectedCycleId(cycle.cycleId);
                              setSelectedCycleRoomName(cycle.roomName);
                              setSelectedCycleEndDate(cycle.periodEnd);
                              setAdjustCycleModalVisible(true);
                            }}
                            variant="ghost"
                          />
                          <Button
                            label="Close only"
                            loading={closingCycleId === cycle.cycleId}
                            onPress={() => void handleCloseCycle(cycle.cycleId)}
                            variant="secondary"
                          />
                          <Button
                            label="Close and start next"
                            loading={reopeningCycleId === cycle.cycleId}
                            onPress={() => void handleCloseCycle(cycle.cycleId, true)}
                          />
                        </View>
                      ) : undefined
                    }
                    onPress={() => setDetail({ kind: 'cycle', item: cycle })}
                    toneStyle={styles.infoCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{cycle.roomName}</Text>
                      <Text style={styles.badgeText}>{formatStatusLabel(cycle.status)}</Text>
                    </View>
                    <Text style={styles.helperText}>Tenant: {cycle.tenantName ?? 'No tenant assigned'}</Text>
                    <Text style={styles.helperText}>Period: {formatDate(cycle.periodStart)} to {formatDate(cycle.periodEnd)}</Text>
                    <View style={styles.detailGrid}>
                      <View style={styles.metaCard}><Text style={styles.metaLabel}>Cycle usage</Text><Text style={styles.metaValue}>{formatNumber(cycle.cycleToDateKwh, 'kWh')}</Text></View>
                      <View style={styles.metaCard}><Text style={styles.metaLabel}>Projected bill</Text><Text style={styles.metaValue}>{formatCurrency(cycle.projectedCurrentBill)}</Text></View>
                    </View>
                  </TappableCard>
                ))
              )}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Closed cycles ready for draft</Text>
              {!statementData?.readyCycles.length ? (
                <EmptyState title="No cycle ready for draft yet" description="Closed cycles will appear here after the cutoff is reached and the cycle is properly closed." />
              ) : (
                statementData.readyCycles.map((cycle) => (
                  <TappableCard
                    key={cycle.cycleId}
                    footer={
                      canManageCycles ? (
                        <Button
                          label="Generate draft"
                          loading={draftingCycleId === cycle.cycleId}
                          onPress={() => void handleGenerateDraft(cycle.cycleId)}
                          variant="secondary"
                        />
                      ) : undefined
                    }
                    onPress={() => setDetail({ kind: 'cycle', item: cycle })}
                    toneStyle={styles.warningCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{cycle.roomName}</Text>
                      <Text style={styles.badgeText}>Ready for draft</Text>
                    </View>
                    <Text style={styles.helperText}>Closed: {formatDateTime(cycle.closedAt)}</Text>
                    <Text style={styles.helperText}>Cycle usage: {formatNumber(cycle.cycleToDateKwh, 'kWh')}</Text>
                  </TappableCard>
                ))
              )}
            </SectionCard>
          </>
        ) : null}

        {!loading && activeTab === 'statements' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Statements</Text>
            {!statementData?.statements.length ? (
              <EmptyState title="No statements yet" description="Draft and issued bills will appear here." />
            ) : (
              statementData.statements.map((statement) => (
                <TappableCard
                  key={statement.statementId}
                  footer={
                    canManageCycles && statement.status === 'draft' ? (
                      <Button
                        label="Issue bill"
                        loading={issuingStatementId === statement.statementId}
                        onPress={() => void handleIssueStatement(statement.statementId)}
                        variant="secondary"
                      />
                    ) : undefined
                  }
                  onPress={() => setDetail({ kind: 'statement', item: statement })}
                  toneStyle={getStatementTone(statement)}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.itemTitle}>{statement.roomName}</Text>
                    <Text style={styles.badgeText}>{formatStatusLabel(statement.status)}</Text>
                  </View>
                  <Text style={styles.helperText}>{statement.statementNumber ?? 'Draft statement'}</Text>
                  <Text style={styles.helperText}>Tenant: {statement.tenantName ?? 'No tenant assigned'}</Text>
                  <View style={styles.detailGrid}>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Total</Text><Text style={styles.metaValue}>{formatCurrency(statement.totalAmount)}</Text></View>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Outstanding</Text><Text style={styles.metaValue}>{formatCurrency(statement.outstandingAmount)}</Text></View>
                  </View>
                </TappableCard>
              ))
            )}
          </SectionCard>
        ) : null}

        {!loading && activeTab === 'payments' ? (
          <>
            <SectionCard>
              <Text style={styles.sectionTitle}>Pending verification</Text>
              {!statementData?.pendingPayments.length ? (
                <EmptyState title="No payment waiting for review" description="Submitted tenant payments will appear here first when they need landlord action." />
              ) : (
                statementData.pendingPayments.map((payment) => (
                  <TappableCard
                    key={payment.paymentId}
                    footer={
                      <View style={styles.footerButtons}>
                        <Button
                          label="Approve"
                          loading={verifyingPaymentId === payment.paymentId}
                          onPress={() => void handleVerifyPayment(payment.paymentId, 'approve')}
                          variant="secondary"
                        />
                        <Button
                          label="Reject"
                          loading={verifyingPaymentId === payment.paymentId}
                          onPress={() => {
                            setSelectedPaymentId(payment.paymentId);
                            setRejectionReason('');
                            setRejectPaymentModalVisible(true);
                          }}
                          variant="danger"
                        />
                      </View>
                    }
                    onPress={() => setDetail({ kind: 'payment', item: payment })}
                    toneStyle={styles.warningCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{payment.roomName}</Text>
                      <Text style={styles.badgeText}>Pending</Text>
                    </View>
                    <Text style={styles.helperText}>Tenant: {payment.tenantName ?? 'Unknown tenant'}</Text>
                    <Text style={styles.helperText}>Amount: {formatCurrency(payment.amount)} - Submitted {formatDateTime(payment.submittedAt)}</Text>
                  </TappableCard>
                ))
              )}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Payment history</Text>
              {!statementData?.payments.length ? (
                <EmptyState title="No payment history yet" description="Submitted tenant payments will appear here." />
              ) : (
                statementData.payments.map((payment) => (
                  <TappableCard
                    key={payment.paymentId}
                    onPress={() => setDetail({ kind: 'payment', item: payment })}
                    toneStyle={getPaymentTone(payment)}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{payment.roomName}</Text>
                      <Text style={styles.badgeText}>{formatStatusLabel(payment.status)}</Text>
                    </View>
                    <Text style={styles.helperText}>Tenant: {payment.tenantName ?? 'Unknown tenant'}</Text>
                    <Text style={styles.helperText}>Amount: {formatCurrency(payment.amount)} - {formatStatusLabel(payment.paymentMethod)}</Text>
                  </TappableCard>
                ))
              )}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Receipts</Text>
              {!statementData?.receipts.length ? (
                <EmptyState title="No receipts yet" description="Receipts will appear here after payment approvals start coming in." />
              ) : (
                statementData.receipts.map((receipt) => (
                  <TappableCard
                    key={receipt.receiptId}
                    onPress={() => setDetail({ kind: 'receipt', item: receipt })}
                    toneStyle={styles.successCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{receipt.receiptNumber}</Text>
                      <Text style={styles.badgeText}>Receipt</Text>
                    </View>
                    <Text style={styles.helperText}>{receipt.roomName}</Text>
                    <Text style={styles.helperText}>Amount: {formatCurrency(receipt.amount)} - Issued {formatDateTime(receipt.issuedAt)}</Text>
                  </TappableCard>
                ))
              )}
            </SectionCard>
          </>
        ) : null}

        {!loading && activeTab === 'estimates' ? (
          <>
            <SectionCard>
              <Text style={styles.sectionTitle}>Find estimates</Text>
              <Field
                autoCapitalize="words"
                label="Search billing entries"
                onChangeText={setSearchTerm}
                placeholder="Search room, tenant, or device"
                value={searchTerm}
              />
              <SelectField
                label="Billing filter"
                onSelect={(value) => setBillingFilter(value as BillingFilter)}
                options={[
                  { label: 'All rooms', value: 'all' as const },
                  { label: 'Billable rooms', value: 'billable' as const },
                  { label: 'Needs attention', value: 'needs_attention' as const },
                  { label: 'No tenant assigned', value: 'no_tenant' as const },
                ]}
                selectedValue={billingFilter}
              />
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Estimate list</Text>
              {!filteredRooms.length ? (
                <EmptyState title="No estimate entries yet" description="Estimate entries will appear once owned rooms have readings or assigned tenants." />
              ) : (
                filteredRooms.map((room) => (
                  <TappableCard
                    key={room.roomId}
                    onPress={() => router.push(`/landlord-room-detail?roomId=${room.roomId}`)}
                    toneStyle={isBillable(room) ? styles.successCard : styles.warningCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.itemTitle}>{room.roomName}</Text>
                      <Text style={styles.badgeText}>{isBillable(room) ? 'Billable' : 'Needs attention'}</Text>
                    </View>
                    <Text style={styles.helperText}>Tenant: {room.tenantName ?? 'No tenant assigned'}</Text>
                    <Text style={styles.helperText}>Device: {room.deviceIdentifier ?? 'No device assigned'}</Text>
                    <View style={styles.detailGrid}>
                      <View style={styles.metaCard}><Text style={styles.metaLabel}>Current power</Text><Text style={styles.metaValue}>{formatNumber(room.currentPowerUsage, 'W')}</Text></View>
                      <View style={styles.metaCard}><Text style={styles.metaLabel}>Monthly estimate</Text><Text style={styles.metaValue}>{formatCurrency(room.estimatedMonthlyCost)}</Text></View>
                    </View>
                  </TappableCard>
                ))
              )}
            </SectionCard>
          </>
        ) : null}

        <FormModal
          onClose={() => {
            setCycleModalVisible(false);
            resetCycleForm();
          }}
          subtitle="Choose a ready room. The cycle will start today and end one month later automatically."
          title="Open first billing cycle"
          visible={cycleModalVisible}>
          <SelectField label="Room" onSelect={(value) => setSelectedRoomId(String(value))} options={openableRooms.map((room) => ({ label: `${room.roomName} - ${room.tenantName} - ${room.deviceIdentifier}`, value: String(room.roomId) }))} placeholder="Select room" selectedValue={selectedRoomId} />
          <View style={styles.inlineItem}>
            <Text style={styles.itemTitle}>Automatic cycle window</Text>
            <Text style={styles.helperText}>{formatDate(getAutoCycleWindow().start)} to {formatDate(getAutoCycleWindow().end)}</Text>
          </View>
          <View style={styles.footerButtons}>
            <Button label="Cancel" onPress={() => { setCycleModalVisible(false); resetCycleForm(); }} variant="ghost" />
            <Button label="Open cycle" loading={creatingCycle} onPress={() => void handleCreateCycle()} />
          </View>
        </FormModal>

        <FormModal
          onClose={() => {
            setAdjustCycleModalVisible(false);
            resetAdjustCycleForm();
          }}
          subtitle="Use this when you need to test billing now or adjust a real cutoff date."
          title={`Adjust cutoff for ${selectedCycleRoomName || 'cycle'}`}
          visible={adjustCycleModalVisible}>
          <Field label="Cycle end date" onChangeText={setSelectedCycleEndDate} placeholder="YYYY-MM-DD" value={selectedCycleEndDate} />
          <View style={styles.footerButtons}>
            <Button label="Set to today" onPress={() => setSelectedCycleEndDate(getAutoCycleWindow().start)} variant="ghost" />
            <Button label="Save cutoff" loading={updatingCycleId === selectedCycleId} onPress={() => void handleUpdateCycleEndDate()} />
          </View>
        </FormModal>

        <FormModal
          onClose={() => {
            setRejectPaymentModalVisible(false);
            resetRejectPaymentForm();
          }}
          subtitle="Rejected payments stay in the tenant history, so give a clear reason they can act on."
          title="Reject payment"
          visible={rejectPaymentModalVisible}>
          <Field label="Rejection reason" multiline onChangeText={setRejectionReason} placeholder="Explain what needs to be corrected before the tenant resubmits." value={rejectionReason} />
          <View style={styles.footerButtons}>
            <Button label="Cancel" onPress={() => { setRejectPaymentModalVisible(false); resetRejectPaymentForm(); }} variant="ghost" />
            <Button label="Reject payment" loading={verifyingPaymentId === selectedPaymentId} onPress={() => { if (selectedPaymentId !== null) void handleVerifyPayment(selectedPaymentId, 'reject', rejectionReason); }} variant="danger" />
          </View>
        </FormModal>

        <FormModal onClose={() => setDetail(null)} title={detail ? `${detail.item.roomName} details` : 'Billing details'} visible={detail !== null}>
          {renderDetailContent()}
        </FormModal>
      </ScreenShell>
    </RequireRole>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  helperText: { color: theme.colors.textMuted, lineHeight: 20 },
  errorText: { color: theme.colors.danger, fontWeight: '600' },
  noteText: { color: theme.colors.secondary, lineHeight: 20 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { flexBasis: 220, flexGrow: 1, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.overlayStrong, backgroundColor: theme.colors.surfaceMuted, gap: 6, padding: 14 },
  actionCardActive: { backgroundColor: 'rgba(79,163,181,0.08)', borderColor: 'rgba(79,163,181,0.28)' },
  actionValue: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  cardShell: { borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.overlayStrong, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' },
  cardPressable: { gap: 8, padding: 14 },
  cardPressableActive: { backgroundColor: 'rgba(79,163,181,0.05)' },
  cardFooter: { borderTopWidth: 1, borderTopColor: theme.colors.overlayMedium, padding: 14, paddingTop: 12 },
  infoCard: { borderColor: theme.colors.primary, backgroundColor: 'rgba(79,163,181,0.08)' },
  warningCard: { borderColor: '#c99a1a', backgroundColor: 'rgba(201,154,26,0.12)' },
  dangerCard: { borderColor: theme.colors.danger, backgroundColor: 'rgba(224,93,93,0.12)' },
  successCard: { borderColor: theme.colors.success, backgroundColor: 'rgba(63,191,127,0.12)' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  badgeText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  tapHintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(79,163,181,0.18)', marginTop: 2, paddingTop: 10 },
  tapHintText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
  tapHintArrow: { color: theme.colors.primary, fontSize: 16, fontWeight: '800' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaCard: { flexGrow: 1, flexBasis: 150, minHeight: 72, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.overlayMedium, backgroundColor: theme.colors.surface, gap: 4, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  metaLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  metaValue: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  detailStack: { gap: 12 },
  inlineItem: { borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.overlayStrong, backgroundColor: theme.colors.surfaceMuted, gap: 4, padding: 12 },
  footerButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemTitle: { color: theme.colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
});

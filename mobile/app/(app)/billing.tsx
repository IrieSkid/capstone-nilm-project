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
  NotificationSummaryData,
  TenantCurrentBillingData,
} from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatStatusLabel } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const PAYMENT_METHOD_OPTIONS = [
  { label: 'GCash', value: 'gcash' },
  { label: 'Maya', value: 'maya' },
  { label: 'Bank transfer', value: 'bank_transfer' },
  { label: 'Cash', value: 'cash' },
  { label: 'Other', value: 'other' },
] as const;

type BillingTab = 'overview' | 'bills' | 'history';
type DetailState =
  | { kind: 'cycle'; item: BillingCycleRecord }
  | { kind: 'statement'; item: BillingStatementRecord }
  | { kind: 'payment'; item: BillingPaymentRecord }
  | { kind: 'receipt'; item: BillingReceiptRecord }
  | null;

function canSubmitPayment(statement: BillingStatementRecord) {
  return ['issued', 'partially_paid'].includes(statement.status) && statement.availableToSubmitAmount > 0;
}

function getStatementTone(statement: BillingStatementRecord) {
  if (statement.status === 'paid') return styles.successCard;
  if (statement.isOverdue) return styles.dangerCard;
  if (statement.isDueSoon || statement.pendingPaymentsAmount > 0) return styles.warningCard;
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

export default function TenantBillingScreen() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { showError, showSuccess } = useAppAlert();
  const [activeTab, setActiveTab] = useState<BillingTab>('overview');
  const [data, setData] = useState<TenantCurrentBillingData | null>(null);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<BillingStatementRecord | null>(null);
  const [detail, setDetail] = useState<DetailState>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('gcash');
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const loadData = useCallback(async (options?: { pullToRefresh?: boolean }) => {
    if (!token) return;

    try {
      if (options?.pullToRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);
      const [nextBilling, nextNotificationSummary] = await Promise.all([
        apiRequest<TenantCurrentBillingData>('/tenant/billing/current', { token }),
        apiRequest<NotificationSummaryData>('/notifications/summary', { token }),
      ]);

      setData(nextBilling);
      setNotificationSummary(nextNotificationSummary);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load your billing data.'));
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

  const summaryItems = useMemo(
    () => [
      { label: 'Projected current bill', value: formatCurrency(data?.summary.totalProjectedCurrentBill) },
      { label: 'Outstanding balance', value: formatCurrency(data?.summary.totalOutstandingAmount) },
      { label: 'Pending payments', value: String(data?.summary.pendingPayments ?? 0) },
      { label: 'Receipts issued', value: String(data?.summary.receiptsIssued ?? 0) },
    ],
    [data?.summary.pendingPayments, data?.summary.receiptsIssued, data?.summary.totalOutstandingAmount, data?.summary.totalProjectedCurrentBill],
  );

  const attentionStatements = useMemo(
    () =>
      [...(data?.statements ?? [])]
        .filter((statement) => statement.outstandingAmount > 0)
        .sort((left, right) => {
          if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
          if (left.isDueSoon !== right.isDueSoon) return left.isDueSoon ? -1 : 1;
          return right.outstandingAmount - left.outstandingAmount;
        }),
    [data?.statements],
  );

  function openPaymentModal(statement: BillingStatementRecord) {
    setSelectedStatement(statement);
    setPaymentAmount(statement.availableToSubmitAmount.toFixed(2));
    setPaymentMethod('gcash');
    setPaymentReferenceNumber('');
    setPaymentNotes('');
    setPaymentModalVisible(true);
  }

  function resetPaymentForm() {
    setSelectedStatement(null);
    setPaymentAmount('');
    setPaymentMethod('gcash');
    setPaymentReferenceNumber('');
    setPaymentNotes('');
  }

  async function handleSubmitPayment() {
    if (!token || !selectedStatement) return;
    const numericAmount = Number(paymentAmount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showError('Unable to submit payment', 'Enter a valid payment amount.');
      return;
    }

    try {
      setSubmittingPayment(true);
      await apiRequest(`/tenant/billing/statements/${selectedStatement.statementId}/payments`, {
        method: 'POST',
        token,
        body: {
          amount: numericAmount,
          payment_method: paymentMethod,
          reference_number: paymentReferenceNumber,
          notes: paymentNotes,
        },
      });
      setPaymentModalVisible(false);
      resetPaymentForm();
      showSuccess('Payment submitted', 'Your payment is now waiting for landlord verification.');
      await loadData();
    } catch (paymentError) {
      showError('Unable to submit payment', getErrorMessage(paymentError, 'Unable to submit this payment.'));
    } finally {
      setSubmittingPayment(false);
    }
  }

  function renderDetailContent() {
    if (!detail) return null;

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
            <View style={styles.metaCard}><Text style={styles.metaLabel}>Rate</Text><Text style={styles.metaValue}>{formatCurrency(statement.ratePerKwhSnapshot)} / kWh</Text></View>
          </View>
          <Text style={styles.helperText}>Statement: {statement.statementNumber ?? 'Draft statement'}</Text>
          <Text style={styles.helperText}>Period: {formatDate(statement.periodStart)} to {formatDate(statement.periodEnd)}</Text>
          <Text style={styles.helperText}>Due date: {formatDate(statement.dueDate)}</Text>
          <Text style={styles.helperText}>Approved payments: {formatCurrency(statement.approvedPaymentsAmount)}</Text>
          <Text style={styles.helperText}>Pending review: {formatCurrency(statement.pendingPaymentsAmount)}</Text>
          {statement.items.map((item) => (
            <View key={item.itemId} style={styles.inlineItem}>
              <Text style={styles.itemTitle}>{item.label}</Text>
              {item.description ? <Text style={styles.helperText}>{item.description}</Text> : null}
              <Text style={styles.helperText}>{formatCurrency(item.totalAmount)}</Text>
            </View>
          ))}
          {canSubmitPayment(statement) ? <Button label="Submit payment" onPress={() => { setDetail(null); openPaymentModal(statement); }} variant="secondary" /> : null}
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
          <Text style={styles.helperText}>Statement: {payment.statementNumber ?? 'Billing payment'}</Text>
          <Text style={styles.helperText}>Submitted: {formatDateTime(payment.submittedAt)}</Text>
          {payment.referenceNumber ? <Text style={styles.helperText}>Reference: {payment.referenceNumber}</Text> : null}
          {payment.notes ? <Text style={styles.helperText}>Notes: {payment.notes}</Text> : null}
          {payment.rejectionReason ? <Text style={styles.errorText}>Rejected: {payment.rejectionReason}</Text> : null}
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
        <Text style={styles.helperText}>Issued: {formatDateTime(receipt.issuedAt)}</Text>
        <Text style={styles.helperText}>Method: {formatStatusLabel(receipt.paymentMethod)}</Text>
        {receipt.referenceNumber ? <Text style={styles.helperText}>Reference: {receipt.referenceNumber}</Text> : null}
        {receipt.statementNumber ? <Text style={styles.helperText}>Statement: {receipt.statementNumber}</Text> : null}
      </View>
    );
  }

  return (
    <RequireRole roles={['tenant']} permissionKey="tenant.billing.view">
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Track your current cycle, official bills, and payment records without a long billing scroll."
        title="Billing">
        <SectionCard>
          <Text style={styles.sectionTitle}>Billing workspace</Text>
          <Text style={styles.helperText}>Notifications moved into their own inbox, and the important billing records now open as detail cards.</Text>
          <SummaryGrid items={summaryItems} />
          <View style={styles.actionRow}>
            <Pressable android_ripple={{ color: 'rgba(79,163,181,0.08)' }} onPress={() => router.push('/notifications')} style={({ hovered, pressed }) => [styles.actionCard, (hovered || pressed) ? styles.actionCardActive : null]}>
              <Text style={styles.metaLabel}>Notification inbox</Text>
              <Text style={styles.actionValue}>{notificationSummary?.unreadNotifications ?? 0} unread</Text>
              <Text style={styles.helperText}>Open your notifications</Text>
            </Pressable>
            <Pressable
              android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
              disabled={!attentionStatements[0]}
              onPress={() => attentionStatements[0] && setDetail({ kind: 'statement', item: attentionStatements[0] })}
              style={({ hovered, pressed }) => [styles.actionCard, attentionStatements[0]?.isOverdue ? styles.dangerCard : attentionStatements[0]?.isDueSoon ? styles.warningCard : null, !attentionStatements[0] ? styles.dimmed : null, (hovered || pressed) && attentionStatements[0] ? styles.actionCardActive : null]}>
              <Text style={styles.metaLabel}>Next bill to handle</Text>
              <Text style={styles.actionValue}>{attentionStatements[0] ? formatCurrency(attentionStatements[0].outstandingAmount) : 'All clear'}</Text>
              <Text style={styles.helperText}>{attentionStatements[0] ? `${attentionStatements[0].roomName} - ${formatStatusLabel(attentionStatements[0].status)}` : 'No outstanding bill needs action now.'}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <OptionChips onSelect={(value) => setActiveTab(value)} options={[{ label: 'Overview', value: 'overview' }, { label: 'Bills', value: 'bills' }, { label: 'History', value: 'history' }]} selectedValue={activeTab} />

        {loading ? <SectionCard><ActivityIndicator color={theme.colors.primary} /><Text style={styles.helperText}>Loading billing workspace...</Text></SectionCard> : null}

        {!loading && activeTab === 'overview' ? (
          <>
            <SectionCard>
              <Text style={styles.sectionTitle}>Active cycle</Text>
              {!data?.cycles.length ? <EmptyState title="No active billing cycle yet" description={(data?.summary.assignedRooms ?? 0) > 0 ? 'Your landlord has not opened an official billing cycle for your room yet.' : 'No room is assigned to your account yet.'} /> : data.cycles.map((cycle) => (
                <TappableCard key={cycle.cycleId} onPress={() => setDetail({ kind: 'cycle', item: cycle })} toneStyle={styles.infoCard}>
                  <View style={styles.cardHeader}><Text style={styles.itemTitle}>{cycle.roomName}</Text><Text style={styles.badgeText}>{formatStatusLabel(cycle.status)}</Text></View>
                  <Text style={styles.helperText}>Period: {formatDate(cycle.periodStart)} to {formatDate(cycle.periodEnd)}</Text>
                  <View style={styles.detailGrid}>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Cycle usage</Text><Text style={styles.metaValue}>{formatNumber(cycle.cycleToDateKwh, 'kWh')}</Text></View>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Projected bill</Text><Text style={styles.metaValue}>{formatCurrency(cycle.projectedCurrentBill)}</Text></View>
                  </View>
                </TappableCard>
              ))}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Bills needing attention</Text>
              {!attentionStatements.length ? <EmptyState title="No urgent bill actions" description="You do not have any outstanding official bill that needs attention right now." /> : attentionStatements.slice(0, 3).map((statement) => (
                <TappableCard key={statement.statementId} footer={canSubmitPayment(statement) ? <Button label="Submit payment" onPress={() => openPaymentModal(statement)} variant="secondary" /> : undefined} onPress={() => setDetail({ kind: 'statement', item: statement })} toneStyle={getStatementTone(statement)}>
                  <View style={styles.cardHeader}><Text style={styles.itemTitle}>{statement.roomName}</Text><Text style={styles.badgeText}>{statement.isOverdue ? 'Overdue' : statement.isDueSoon ? 'Due soon' : formatStatusLabel(statement.status)}</Text></View>
                  <Text style={styles.helperText}>{statement.statementNumber ?? 'Official statement'} - due {formatDate(statement.dueDate)}</Text>
                  <View style={styles.detailGrid}>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Total</Text><Text style={styles.metaValue}>{formatCurrency(statement.totalAmount)}</Text></View>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Outstanding</Text><Text style={styles.metaValue}>{formatCurrency(statement.outstandingAmount)}</Text></View>
                  </View>
                </TappableCard>
              ))}
            </SectionCard>
          </>
        ) : null}

        {!loading && activeTab === 'bills' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Official bills</Text>
            {!data?.statements.length ? <EmptyState title="No issued bills yet" description="Your landlord has not issued any billing statement for your room yet." /> : data.statements.map((statement) => (
              <TappableCard key={statement.statementId} footer={canSubmitPayment(statement) ? <Button label="Submit payment" onPress={() => openPaymentModal(statement)} variant="secondary" /> : undefined} onPress={() => setDetail({ kind: 'statement', item: statement })} toneStyle={getStatementTone(statement)}>
                <View style={styles.cardHeader}><Text style={styles.itemTitle}>{statement.roomName}</Text><Text style={styles.badgeText}>{formatStatusLabel(statement.status)}</Text></View>
                <Text style={styles.helperText}>{statement.statementNumber ?? 'Official statement'}</Text>
                <Text style={styles.helperText}>Period: {formatDate(statement.periodStart)} to {formatDate(statement.periodEnd)}</Text>
                <View style={styles.detailGrid}>
                  <View style={styles.metaCard}><Text style={styles.metaLabel}>Billed usage</Text><Text style={styles.metaValue}>{formatNumber(statement.billedKwh, 'kWh')}</Text></View>
                  <View style={styles.metaCard}><Text style={styles.metaLabel}>Outstanding</Text><Text style={styles.metaValue}>{formatCurrency(statement.outstandingAmount)}</Text></View>
                </View>
              </TappableCard>
            ))}
          </SectionCard>
        ) : null}

        {!loading && activeTab === 'history' ? (
          <>
            <SectionCard>
              <Text style={styles.sectionTitle}>Payment history</Text>
              {!data?.payments.length ? <EmptyState title="No payments submitted yet" description="Submitted payments will appear here." /> : data.payments.map((payment) => (
                <TappableCard key={payment.paymentId} onPress={() => setDetail({ kind: 'payment', item: payment })} toneStyle={getPaymentTone(payment)}>
                  <View style={styles.cardHeader}><Text style={styles.itemTitle}>{payment.roomName}</Text><Text style={styles.badgeText}>{formatStatusLabel(payment.status)}</Text></View>
                  <Text style={styles.helperText}>{payment.statementNumber ?? 'Billing payment'}</Text>
                  <View style={styles.detailGrid}>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Amount</Text><Text style={styles.metaValue}>{formatCurrency(payment.amount)}</Text></View>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Method</Text><Text style={styles.metaValue}>{formatStatusLabel(payment.paymentMethod)}</Text></View>
                  </View>
                </TappableCard>
              ))}
            </SectionCard>

            <SectionCard>
              <Text style={styles.sectionTitle}>Receipts</Text>
              {!data?.receipts.length ? <EmptyState title="No receipts yet" description="Receipts appear here after a payment gets approved." /> : data.receipts.map((receipt) => (
                <TappableCard key={receipt.receiptId} onPress={() => setDetail({ kind: 'receipt', item: receipt })} toneStyle={styles.successCard}>
                  <View style={styles.cardHeader}><Text style={styles.itemTitle}>{receipt.receiptNumber}</Text><Text style={styles.badgeText}>Receipt</Text></View>
                  <Text style={styles.helperText}>{receipt.roomName}</Text>
                  <View style={styles.detailGrid}>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Amount</Text><Text style={styles.metaValue}>{formatCurrency(receipt.amount)}</Text></View>
                    <View style={styles.metaCard}><Text style={styles.metaLabel}>Issued</Text><Text style={styles.metaValue}>{formatDateTime(receipt.issuedAt)}</Text></View>
                  </View>
                </TappableCard>
              ))}
            </SectionCard>
          </>
        ) : null}

        <FormModal onClose={() => { setPaymentModalVisible(false); resetPaymentForm(); }} subtitle="Submit one payment entry for this bill. Your landlord must verify it before it becomes an official receipt." title={`Submit payment${selectedStatement ? ` for ${selectedStatement.roomName}` : ''}`} visible={paymentModalVisible}>
          {selectedStatement ? <View style={styles.inlineItem}><Text style={styles.itemTitle}>Outstanding {formatCurrency(selectedStatement.outstandingAmount)}</Text><Text style={styles.helperText}>Available to submit now: {formatCurrency(selectedStatement.availableToSubmitAmount)}</Text></View> : null}
          <Field keyboardType="decimal-pad" label="Payment amount" onChangeText={setPaymentAmount} placeholder="0.00" value={paymentAmount} />
          <SelectField label="Payment method" onSelect={(value) => setPaymentMethod(String(value))} options={PAYMENT_METHOD_OPTIONS.map((option) => ({ label: option.label, value: option.value }))} selectedValue={paymentMethod} />
          <Field autoCapitalize="characters" label="Reference number" onChangeText={setPaymentReferenceNumber} placeholder={paymentMethod === 'cash' ? 'Optional for cash' : 'Required for digital payments'} value={paymentReferenceNumber} />
          <Field label="Notes" multiline onChangeText={setPaymentNotes} placeholder="Optional notes for the landlord" value={paymentNotes} />
          <View style={styles.footerButtons}>
            <Button label="Cancel" onPress={() => { setPaymentModalVisible(false); resetPaymentForm(); }} variant="ghost" />
            <Button label="Submit payment" loading={submittingPayment} onPress={() => void handleSubmitPayment()} />
          </View>
        </FormModal>

        <FormModal onClose={() => setDetail(null)} subtitle="Billing records open as details so the main screen stays shorter and easier to scan." title={detail ? `${detail.item.roomName} details` : 'Billing details'} visible={detail !== null}>
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
  dimmed: { opacity: 0.72 },
  cardShell: { borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.overlayStrong, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' },
  cardPressable: { gap: 8, padding: 14 },
  cardPressableActive: { backgroundColor: 'rgba(79,163,181,0.05)' },
  cardFooter: { borderTopWidth: 1, borderTopColor: theme.colors.overlayMedium, padding: 14, paddingTop: 12 },
  infoCard: { borderColor: theme.colors.primary, backgroundColor: 'rgba(79,163,181,0.08)' },
  warningCard: { borderColor: '#c99a1a', backgroundColor: 'rgba(201,154,26,0.12)' },
  dangerCard: { borderColor: theme.colors.danger, backgroundColor: 'rgba(224,93,93,0.12)' },
  successCard: { borderColor: theme.colors.success, backgroundColor: 'rgba(63,191,127,0.12)' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemTitle: { color: theme.colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
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
});

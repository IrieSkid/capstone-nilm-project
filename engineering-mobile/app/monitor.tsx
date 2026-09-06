import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest, getErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { LineChart } from '@/components/LineChart';
import { MetricCard } from '@/components/MetricCard';
import { RangeSelector } from '@/components/RangeSelector';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { MonitoringDashboard, MonitoringRange, MonitoringReport, ReportRange } from '@/types/models';
import { formatCurrency, formatDateTime, formatHours, formatNumber, titleCase } from '@/utils/format';
import { exportCsv, exportPdf } from '@/utils/reports';
import { theme } from '@/utils/theme';

const DASHBOARD_RANGES = ['live', '1h', '24h', '7d', '30d'] as const;
const REPORT_RANGES = ['24h', '7d', '30d'] as const;

function projectionMessage(dashboard: MonitoringDashboard) {
  const projection = dashboard.monthlyProjection;
  if (projection.status === 'counter_reset') return 'The cumulative energy counter reset during this month. Projection is withheld to avoid a misleading result.';
  if (projection.status === 'unavailable') return 'No current-month energy interval is available yet.';
  if (projection.status === 'insufficient_data') return `Collect at least ${projection.minimumObservationHours} hours before projecting a full month.`;
  if (projection.status === 'provisional') return 'This early projection is provisional and will stabilize after at least seven days of readings.';
  return 'Projection is based on the current month’s observed energy rate and configured room tariff.';
}

export default function MonitorScreen() {
  const { roomId: roomIdParam } = useLocalSearchParams<{ roomId?: string }>();
  const roomId = Number(roomIdParam);
  const { user, token } = useAuth();
  const [range, setRange] = useState<MonitoringRange>('live');
  const [reportRange, setReportRange] = useState<ReportRange>('24h');
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!token || !Number.isInteger(roomId) || roomId <= 0) return;
    if (!quiet) setError(null);
    try {
      const result = await apiRequest<MonitoringDashboard>(`/monitoring/rooms/${roomId}/dashboard?range=${range}`, { token });
      setDashboard(result);
    } catch (requestError) {
      if (!quiet) setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, roomId, token]);

  useEffect(() => {
    setLoading(true);
    void loadDashboard();
    if (range !== 'live') return;
    const interval = setInterval(() => void loadDashboard(true), 3000);
    return () => clearInterval(interval);
  }, [loadDashboard, range]);

  const powerValues = useMemo(() => dashboard?.history.map((sample) => sample.powerW) ?? [], [dashboard]);
  const voltageValues = useMemo(() => dashboard?.history.map((sample) => sample.voltage) ?? [], [dashboard]);
  const currentValues = useMemo(() => dashboard?.history.map((sample) => sample.current) ?? [], [dashboard]);
  const deviceOnline = dashboard?.room.deviceStatus === 'online';

  async function createReport(kind: 'csv' | 'pdf') {
    if (!token) return;
    setExporting(kind);
    try {
      const report = await apiRequest<MonitoringReport>(`/monitoring/rooms/${roomId}/report?range=${reportRange}`, { token, timeoutMs: 20000 });
      if (kind === 'csv') await exportCsv(report);
      else await exportPdf(report);
    } catch (reportError) {
      Alert.alert('Report export failed', getErrorMessage(reportError));
    } finally {
      setExporting(null);
    }
  }

  if (!user || !token) return <Redirect href="/login" />;
  if (!Number.isInteger(roomId) || roomId <= 0) return <Redirect href="/rooms" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.primary} onRefresh={() => { setRefreshing(true); void loadDashboard(); }} />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>MEASUREMENT DASHBOARD</Text>
            <Text style={styles.title}>{dashboard?.room.roomName ?? 'Loading room…'}</Text>
            <Text style={styles.subtitle}>{dashboard?.room.deviceIdentifier ?? 'No device assigned'}</Text>
          </View>
          {dashboard ? <StatusBadge status={dashboard.room.deviceStatus} /> : null}
        </View>

        <RangeSelector options={DASHBOARD_RANGES} value={range} onChange={setRange} />

        {range === 'live' ? (
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, !deviceOnline && styles.offlineDot]} />
            <Text style={styles.liveText}>
              {deviceOnline ? 'Receiving data · refreshing every 3 seconds' : 'Waiting for device · checking every 3 seconds'}
            </Text>
          </View>
        ) : null}
        {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><Button label="Retry" variant="secondary" onPress={() => void loadDashboard()} /></View> : null}
        {loading && !dashboard ? <ActivityIndicator color={theme.colors.primary} size="large" style={styles.loader} /> : null}

        {dashboard ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{deviceOnline ? 'Latest measurement' : 'Last stored measurement'}</Text>
              <Text style={styles.sectionMeta}>{formatDateTime(dashboard.latest?.timestamp)}</Text>
            </View>
            {!deviceOnline && dashboard.latest ? (
              <View style={styles.staleNotice}>
                <Text style={styles.staleNoticeText}>These values came from the final successful upload and are no longer live.</Text>
              </View>
            ) : null}
            <View style={styles.metricGrid}>
              <MetricCard label="Real power" value={formatNumber(dashboard.latest?.powerW, 'W')} accent dimmed={!deviceOnline} />
              <MetricCard label="Voltage" value={formatNumber(dashboard.latest?.voltage, 'V', 1)} dimmed={!deviceOnline} />
              <MetricCard label="Current" value={formatNumber(dashboard.latest?.current, 'A', 3)} dimmed={!deviceOnline} />
              <MetricCard label="Apparent power" value={formatNumber(dashboard.latest?.apparentPowerVa, 'VA')} dimmed={!deviceOnline} />
              <MetricCard label="Power factor" value={formatNumber(dashboard.latest?.powerFactor, undefined, 2)} dimmed={!deviceOnline} />
              <MetricCard label="Frequency" value={formatNumber(dashboard.latest?.frequency, 'Hz', 1)} dimmed={!deviceOnline} />
              <MetricCard label="Meter energy" value={formatNumber(dashboard.latest?.energyKwh, 'kWh', 4)} dimmed={!deviceOnline} />
              <MetricCard label="Room rate" value={`${formatCurrency(dashboard.room.ratePerKwh)}/kWh`} />
            </View>

            {!dashboard.latest ? <View style={styles.notice}><Text style={styles.noticeTitle}>No readings received</Text><Text style={styles.noticeText}>The room exists, but its PZEM channel has not sent a valid measurement.</Text></View> : null}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>History · {range.toUpperCase()}</Text>
              <Text style={styles.sectionMeta}>{dashboard.summary.sampleCount} raw samples</Text>
            </View>
            <LineChart title="Real power" values={powerValues} unit="W" />
            <LineChart title="Voltage" values={voltageValues} unit="V" color={theme.colors.success} />
            <LineChart title="Current" values={currentValues} unit="A" color={theme.colors.warning} />

            <Text style={styles.sectionTitle}>Range summary</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="First reading" value={formatDateTime(dashboard.summary.firstReadingAt)} />
              <SummaryRow label="Last reading" value={formatDateTime(dashboard.summary.lastReadingAt)} />
              <SummaryRow label="Average power" value={formatNumber(dashboard.summary.averagePowerW, 'W')} />
              <SummaryRow label="Peak power" value={formatNumber(dashboard.summary.peakPowerW, 'W')} />
              <SummaryRow label="Voltage min / avg / max" value={`${formatNumber(dashboard.summary.minimumVoltage, 'V')} / ${formatNumber(dashboard.summary.averageVoltage, 'V')} / ${formatNumber(dashboard.summary.maximumVoltage, 'V')}`} />
              <SummaryRow label="Average power factor" value={formatNumber(dashboard.summary.averagePowerFactor, undefined, 2)} />
              <SummaryRow label="Measured energy" value={formatNumber(dashboard.summary.measuredEnergyKwh, 'kWh', 4)} />
              <SummaryRow label="Estimated range cost" value={formatCurrency(dashboard.summary.measuredCost)} last />
            </View>

            {dashboard.summary.counterResetDetected ? <View style={styles.warning}><Text style={styles.warningText}>A falling cumulative kWh value indicates a meter reset. Energy and cost for this range are withheld.</Text></View> : null}

            <Text style={styles.sectionTitle}>Monthly projection</Text>
            <View style={styles.projectionCard}>
              <View style={styles.projectionTop}>
                <Text style={styles.projectionStatus}>{titleCase(dashboard.monthlyProjection.status)}</Text>
                <Text style={styles.observation}>{formatHours(dashboard.monthlyProjection.observedHours)} observed</Text>
              </View>
              <Text style={styles.projectionCost}>{formatCurrency(dashboard.monthlyProjection.projectedMonthlyCost)}</Text>
              <Text style={styles.projectionEnergy}>{formatNumber(dashboard.monthlyProjection.projectedMonthlyEnergyKwh, 'kWh')} projected this month</Text>
              <Text style={styles.noticeText}>{projectionMessage(dashboard)}</Text>
            </View>

            <Text style={styles.sectionTitle}>Export report</Text>
            <View style={styles.reportCard}>
              <Text style={styles.noticeText}>Choose a reporting period. The server supplies the measurements and calculations; this device creates the file.</Text>
              <RangeSelector options={REPORT_RANGES} value={reportRange} onChange={setReportRange} />
              <View style={styles.buttonRow}>
                <Button label="Export CSV" variant="secondary" onPress={() => void createReport('csv')} loading={exporting === 'csv'} disabled={exporting !== null} style={styles.flexButton} />
                <Button label="Export PDF" onPress={() => void createReport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} style={styles.flexButton} />
              </View>
            </View>

            <Text style={styles.generated}>Dashboard generated {formatDateTime(dashboard.generatedAt)}</Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.summaryRow, last && styles.summaryRowLast]}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 18, paddingBottom: 48, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  back: { width: 42, height: 42, borderRadius: 12, borderColor: theme.colors.line, borderWidth: 1, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  backText: { color: theme.colors.text, fontSize: 23, fontWeight: '800' },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: theme.colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 12 },
  liveRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  offlineDot: { backgroundColor: theme.colors.danger },
  liveText: { color: theme.colors.textMuted, fontSize: 12 },
  loader: { marginTop: 50 },
  errorBox: { gap: 12, backgroundColor: '#361D24', borderColor: theme.colors.danger, borderWidth: 1, borderRadius: theme.radius.md, padding: 16 },
  error: { color: theme.colors.danger },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 7 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 8 },
  sectionMeta: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'right' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  staleNotice: { backgroundColor: '#301D24', borderLeftColor: theme.colors.danger, borderLeftWidth: 4, borderRadius: theme.radius.sm, padding: 12 },
  staleNoticeText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  notice: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, padding: 15, gap: 5 },
  noticeTitle: { color: theme.colors.text, fontWeight: '800' },
  noticeText: { color: theme.colors.textMuted, lineHeight: 19, fontSize: 13 },
  summaryCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 15 },
  summaryRow: { paddingVertical: 13, borderBottomColor: theme.colors.line, borderBottomWidth: 1, gap: 5 },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  warning: { borderLeftColor: theme.colors.warning, borderLeftWidth: 4, backgroundColor: '#302819', padding: 13, borderRadius: theme.radius.sm },
  warningText: { color: theme.colors.warning, lineHeight: 19 },
  projectionCard: { backgroundColor: '#11303D', borderColor: theme.colors.primary, borderWidth: 1, borderRadius: theme.radius.md, padding: 17, gap: 7 },
  projectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  projectionStatus: { color: theme.colors.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  observation: { color: theme.colors.textMuted, fontSize: 11 },
  projectionCost: { color: theme.colors.text, fontSize: 31, fontWeight: '900' },
  projectionEnergy: { color: theme.colors.primary, fontWeight: '800', marginBottom: 4 },
  reportCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, padding: 16, gap: 15 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  flexButton: { flex: 1 },
  generated: { color: theme.colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 5 },
});

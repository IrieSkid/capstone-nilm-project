import { StyleSheet, Text, View } from 'react-native';

import { HardwareHealth, HardwareHealthStatus } from '@/types/models';
import { formatDateTime, formatDurationSeconds, formatNumber, titleCase } from '@/utils/format';
import { theme } from '@/utils/theme';

const STATUS_COLORS: Record<HardwareHealthStatus, string> = {
  healthy: theme.colors.success,
  delayed: theme.colors.warning,
  pzem_error: theme.colors.danger,
  upload_error: theme.colors.danger,
  offline: theme.colors.danger,
  unassigned: theme.colors.warning,
};

export function HardwareHealthPanel({ health }: { health: HardwareHealth }) {
  const color = STATUS_COLORS[health.status];
  const heartbeat = health.heartbeat;
  const quality = health.samplingQuality;
  const coverage = Math.max(0, Math.min(100, quality.coveragePercentage ?? 0));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SYSTEM HEALTH</Text>
          <Text style={styles.title}>Hardware and data quality</Text>
        </View>
        <View style={[styles.badge, { borderColor: color }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.badgeText, { color }]}>{titleCase(health.status).toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.message}>{health.message}</Text>

      {!health.heartbeatSupported && health.status !== 'unassigned' ? (
        <View style={styles.legacyNotice}>
          <Text style={styles.legacyText}>Heartbeat telemetry has not been received. Upload firmware v1.1.0 to distinguish PZEM failures from complete device outages.</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        <HealthValue label="Last server contact" value={formatDateTime(health.lastSeenAt)} />
        <HealthValue label="Contact age" value={formatDurationSeconds(health.lastSeenAgeSeconds)} />
        <HealthValue label="PZEM link" value={heartbeat ? (heartbeat.pzemOk ? 'OK' : 'ERROR') : 'Not reported'} />
        <HealthValue label="Wi-Fi signal" value={heartbeat?.wifiRssiDbm == null ? 'Not reported' : `${heartbeat.wifiRssiDbm} dBm`} />
        <HealthValue label="ESP32 uptime" value={formatDurationSeconds(heartbeat?.uptimeSeconds)} />
        <HealthValue label="Firmware" value={heartbeat?.firmwareVersion ?? 'Legacy'} />
        <HealthValue label="Reading upload" value={heartbeat?.lastReadingHttpStatus == null ? 'Not reported' : `HTTP ${heartbeat.lastReadingHttpStatus}`} />
        <HealthValue label="Heartbeat received" value={formatDateTime(heartbeat?.receivedAt)} />
      </View>

      <View style={styles.divider} />
      <View style={styles.qualityHeading}>
        <Text style={styles.qualityTitle}>Sampling completeness</Text>
        <Text style={styles.coverage}>{formatNumber(quality.coveragePercentage, '%', 1)}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${coverage}%` }]} /></View>
      <View style={styles.qualityGrid}>
        <HealthValue label="Received / expected" value={`${quality.sampleCount} / ${quality.expectedSampleCount}`} />
        <HealthValue label="Estimated missing" value={String(quality.estimatedMissingSamples)} />
        <HealthValue label="Average interval" value={formatDurationSeconds(quality.averageIntervalSeconds)} />
        <HealthValue label="Longest internal gap" value={formatDurationSeconds(quality.longestGapSeconds)} />
        <HealthValue label="Internal gaps" value={String(quality.gapCount)} />
        <HealthValue label="Expected interval" value={formatDurationSeconds(quality.expectedIntervalSeconds)} />
      </View>
    </View>
  );
}

function HealthValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueBlock}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: theme.colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  message: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  legacyNotice: { backgroundColor: '#302819', borderLeftColor: theme.colors.warning, borderLeftWidth: 4, borderRadius: theme.radius.sm, padding: 11 },
  legacyText: { color: theme.colors.warning, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  valueBlock: { width: '47%', gap: 3 },
  label: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  value: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: theme.colors.line },
  qualityHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qualityTitle: { color: theme.colors.text, fontWeight: '800' },
  coverage: { color: theme.colors.primary, fontWeight: '900' },
  track: { height: 8, backgroundColor: theme.colors.surfaceMuted, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 4 },
  qualityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});

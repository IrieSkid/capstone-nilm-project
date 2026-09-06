import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { MonitoringReport } from '@/types/models';
import { formatCurrency, formatDateTime, formatNumber, titleCase } from '@/utils/format';

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(report: MonitoringReport) {
  const summaryRows = [
    ['Report', report.reportTitle],
    ['Generated', report.generatedAt],
    ['Range', report.range],
    ['Room', report.room.roomName],
    ['Device', report.room.deviceIdentifier ?? 'Unassigned'],
    ['Rate per kWh', report.room.ratePerKwh],
    ['Samples', report.summary.sampleCount],
    ['Measured energy kWh', report.summary.measuredEnergyKwh],
    ['Measured cost PHP', report.summary.measuredCost],
    ['Average power W', report.summary.averagePowerW],
    ['Peak power W', report.summary.peakPowerW],
    ['Projection status', report.monthlyProjection.status],
    ['Projected monthly energy kWh', report.monthlyProjection.projectedMonthlyEnergyKwh],
    ['Projected monthly cost PHP', report.monthlyProjection.projectedMonthlyCost],
    ['Hardware health', report.hardwareHealth.status],
    ['Hardware health message', report.hardwareHealth.message],
    ['Last server contact', report.hardwareHealth.lastSeenAt],
    ['Heartbeat telemetry supported', report.hardwareHealth.heartbeatSupported],
    ['PZEM status', report.hardwareHealth.heartbeat?.pzemOk === undefined ? 'Not reported' : report.hardwareHealth.heartbeat.pzemOk ? 'OK' : 'ERROR'],
    ['Wi-Fi RSSI dBm', report.hardwareHealth.heartbeat?.wifiRssiDbm],
    ['Firmware version', report.hardwareHealth.heartbeat?.firmwareVersion ?? 'Legacy'],
    ['Data coverage percentage', report.hardwareHealth.samplingQuality.coveragePercentage],
    ['Expected samples', report.hardwareHealth.samplingQuality.expectedSampleCount],
    ['Received samples', report.hardwareHealth.samplingQuality.sampleCount],
    ['Estimated missing samples', report.hardwareHealth.samplingQuality.estimatedMissingSamples],
    ['Longest internal gap seconds', report.hardwareHealth.samplingQuality.longestGapSeconds],
  ];
  const measurementHeader = ['Timestamp', 'Voltage V', 'Current A', 'Real power W', 'Apparent power VA', 'Power factor', 'Frequency Hz', 'Energy kWh'];
  const measurements = report.history.map((reading) => [
    reading.timestamp,
    reading.voltage,
    reading.current,
    reading.powerW,
    reading.apparentPowerVa,
    reading.powerFactor,
    reading.frequency,
    reading.energyKwh,
  ]);
  return [
    ...summaryRows.map((row) => row.map(csvCell).join(',')),
    '',
    measurementHeader.map(csvCell).join(','),
    ...measurements.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n');
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] || character);
}

function buildHtml(report: MonitoringReport) {
  const rows = report.history.map((reading) => `
    <tr>
      <td>${escapeHtml(formatDateTime(reading.timestamp))}</td>
      <td>${escapeHtml(formatNumber(reading.voltage, '', 1))}</td>
      <td>${escapeHtml(formatNumber(reading.current, '', 3))}</td>
      <td>${escapeHtml(formatNumber(reading.powerW, '', 1))}</td>
      <td>${escapeHtml(formatNumber(reading.powerFactor, '', 2))}</td>
      <td>${escapeHtml(formatNumber(reading.energyKwh, '', 4))}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 28px; } body { font-family: Arial, sans-serif; color: #10232f; font-size: 11px; }
    h1 { font-size: 23px; margin-bottom: 2px; } h2 { margin-top: 24px; color: #176a80; }
    .meta { color: #526b75; margin-bottom: 18px; } .grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .metric { width: 29%; border: 1px solid #cad9de; border-radius: 8px; padding: 10px; }
    .label { color: #607983; font-size: 9px; text-transform: uppercase; } .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
    .notice { background: #edf7fa; border-left: 4px solid #45c4e6; padding: 10px; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } th { background: #10232f; color: white; }
    th, td { padding: 6px; border: 1px solid #d7e2e6; text-align: right; } th:first-child, td:first-child { text-align: left; }
  </style></head><body>
    <h1>${escapeHtml(report.reportTitle)}</h1>
    <div class="meta">Generated ${escapeHtml(formatDateTime(report.generatedAt))} | Range ${escapeHtml(report.range.toUpperCase())} | Device ${escapeHtml(report.room.deviceIdentifier ?? 'Unassigned')}</div>
    <div class="grid">
      <div class="metric"><div class="label">Samples</div><div class="value">${report.summary.sampleCount}</div></div>
      <div class="metric"><div class="label">Measured energy</div><div class="value">${escapeHtml(formatNumber(report.summary.measuredEnergyKwh, 'kWh', 4))}</div></div>
      <div class="metric"><div class="label">Measured cost</div><div class="value">${escapeHtml(formatCurrency(report.summary.measuredCost))}</div></div>
      <div class="metric"><div class="label">Average power</div><div class="value">${escapeHtml(formatNumber(report.summary.averagePowerW, 'W'))}</div></div>
      <div class="metric"><div class="label">Peak power</div><div class="value">${escapeHtml(formatNumber(report.summary.peakPowerW, 'W'))}</div></div>
      <div class="metric"><div class="label">Monthly projection</div><div class="value">${escapeHtml(formatCurrency(report.monthlyProjection.projectedMonthlyCost))}</div></div>
    </div>
    <div class="notice">Projection status: ${escapeHtml(titleCase(report.monthlyProjection.status))}. Cost uses the configured room rate of ${escapeHtml(formatCurrency(report.room.ratePerKwh))} per kWh.</div>
    <h2>Hardware and data quality</h2>
    <div class="grid">
      <div class="metric"><div class="label">Health state</div><div class="value">${escapeHtml(titleCase(report.hardwareHealth.status))}</div></div>
      <div class="metric"><div class="label">Data coverage</div><div class="value">${escapeHtml(formatNumber(report.hardwareHealth.samplingQuality.coveragePercentage, '%', 1))}</div></div>
      <div class="metric"><div class="label">Received / expected</div><div class="value">${report.hardwareHealth.samplingQuality.sampleCount} / ${report.hardwareHealth.samplingQuality.expectedSampleCount}</div></div>
    </div>
    <div class="notice">${escapeHtml(report.hardwareHealth.message)} Estimated missing samples: ${report.hardwareHealth.samplingQuality.estimatedMissingSamples}. Longest internal gap: ${escapeHtml(formatNumber(report.hardwareHealth.samplingQuality.longestGapSeconds, 'seconds', 1))}.</div>
    <h2>Measurements</h2>
    <table><thead><tr><th>Timestamp</th><th>V</th><th>A</th><th>W</th><th>PF</th><th>kWh</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

function downloadOnWeb(contents: string, filename: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportCsv(report: MonitoringReport) {
  const filename = `${safeName(report.room.roomName)}-${report.range}-monitoring.csv`;
  const csv = buildCsv(report);
  if (Platform.OS === 'web') {
    downloadOnWeb(csv, filename, 'text/csv;charset=utf-8');
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export monitoring CSV' });
}

export async function exportPdf(report: MonitoringReport) {
  const html = buildHtml(report);
  if (Platform.OS === 'web') {
    const popup = window.open('', '_blank');
    if (!popup) throw new Error('Allow pop-ups to open the printable report.');
    popup.document.write(html);
    popup.document.close();
    popup.print();
    return;
  }
  const result = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Export monitoring PDF' });
}

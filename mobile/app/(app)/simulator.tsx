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
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { Device, IngestPayloadResult } from '@/src/types/models';
import { getErrorMessage } from '@/src/utils/errors';
import {
  formatConfidence,
  formatCurrency,
  formatDateTime,
  formatNumber,
} from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

function nowIsoString() {
  const date = new Date();
  const timezoneOffsetMinutes = -date.getTimezoneOffset();
  const sign = timezoneOffsetMinutes >= 0 ? '+' : '-';
  const absoluteOffsetMinutes = Math.abs(timezoneOffsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, '0');
  const offsetMinutes = String(absoluteOffsetMinutes % 60).padStart(2, '0');

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

const airconPreset = {
  voltage: '220',
  current: '4.1',
  power_w: '860',
  frequency: '60.01',
  power_factor: '0.95',
  thd_percentage: '6.8',
  energy_kwh: '0.92',
};

const riceCookerPreset = {
  voltage: '220',
  current: '3.2',
  power_w: '705',
  frequency: '60.01',
  power_factor: '0.98',
  thd_percentage: '3.1',
  energy_kwh: '0.84',
};

export default function SimulatorScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<IngestPayloadResult | null>(null);
  const [form, setForm] = useState({
    device_identifier: 'DEV-101',
    timestamp: nowIsoString(),
    ...airconPreset,
  });

  const loadDevices = useCallback(async () => {
    try {
      setLoadingDevices(true);
      const data = await apiRequest<Device[]>('/devices', {
        token,
      });
      const ingestReadyDevices = data.filter((device) => Boolean(device.roomId));
      setDevices(ingestReadyDevices);
      if (ingestReadyDevices[0] && !ingestReadyDevices.some((device) => device.deviceIdentifier === form.device_identifier)) {
        setForm((current) => ({
          ...current,
          device_identifier: ingestReadyDevices[0].deviceIdentifier,
        }));
      }
    } catch {
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [form.device_identifier, token]);

  useFocusEffect(
    useCallback(() => {
      loadDevices();
    }, [loadDevices]),
  );

  function applyPreset(preset: typeof airconPreset) {
    setForm((current) => ({
      ...current,
      timestamp: nowIsoString(),
      ...preset,
    }));
    setMessage(null);
    setError(null);
  }

  async function handleSend() {
    if (!form.device_identifier.trim()) {
      const nextError = 'Select a registered device identifier.';
      setError(nextError);
      showError('Unable to send reading', nextError);
      return;
    }

    const selectedDevice = devices.find(
      (device) => device.deviceIdentifier === form.device_identifier.trim(),
    );

    if (!selectedDevice || !selectedDevice.roomId) {
      const nextError = 'Select a device that is already assigned to a room.';
      setError(nextError);
      showError('Unable to send reading', nextError);
      return;
    }

    const timestamp = new Date(form.timestamp);
    const voltage = Number(form.voltage);
    const current = Number(form.current);
    const powerW = Number(form.power_w);
    const frequency = Number(form.frequency);
    const powerFactor = Number(form.power_factor);
    const thdPercentage = Number(form.thd_percentage);
    const energyKwh = Number(form.energy_kwh);

    if (Number.isNaN(timestamp.getTime())) {
      const nextError = 'Timestamp must be a valid ISO date.';
      setError(nextError);
      showError('Unable to send reading', nextError);
      return;
    }

    if ([voltage, current, powerW, frequency, powerFactor, thdPercentage, energyKwh].some((value) => Number.isNaN(value))) {
      const nextError = 'All numeric reading fields must contain valid numbers.';
      setError(nextError);
      showError('Unable to send reading', nextError);
      return;
    }

    try {
      setSending(true);
      setError(null);
      setMessage(null);

      const payload = await apiRequest<IngestPayloadResult>('/readings/ingest', {
        method: 'POST',
        body: {
          device_identifier: form.device_identifier.trim(),
          timestamp: form.timestamp,
          voltage,
          current,
          power_w: powerW,
          frequency,
          power_factor: powerFactor,
          thd_percentage: thdPercentage,
          energy_kwh: energyKwh,
        },
      });

      setResult(payload);
      setMessage('Reading sent successfully. The dashboard can now show the new NILM output.');
      showSuccess(
        'Reading sent',
        'The ingest request was accepted and the dashboard can now show the new NILM output.',
      );
    } catch (sendError) {
      const nextError = getErrorMessage(sendError, 'Unable to ingest reading.');
      setError(nextError);
      showError('Unable to send reading', nextError);
    } finally {
      setSending(false);
    }
  }

  return (
    <RequireRole roles={['admin']}>
      <ScreenShell
        subtitle="Use the same ingest endpoint as the external hardware to demo the full software flow."
        title="Device Simulator">
        <SectionCard>
          <Text style={styles.sectionTitle}>Preset readings</Text>
          <View style={styles.buttonRow}>
            <Button label="Aircon sample" onPress={() => applyPreset(airconPreset)} />
            <Button label="Rice cooker sample" onPress={() => applyPreset(riceCookerPreset)} variant="secondary" />
          </View>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Ingest payload</Text>
          {loadingDevices ? <ActivityIndicator color={theme.colors.primary} /> : null}
          {devices.length ? (
            <>
              <Text style={styles.label}>Device identifier</Text>
              <OptionChips
                onSelect={(value) => setForm((current) => ({ ...current, device_identifier: value }))}
                options={devices.map((device) => ({
                  label: `${device.deviceIdentifier} (${device.roomName})`,
                  value: device.deviceIdentifier,
                }))}
                selectedValue={form.device_identifier}
              />
              <Text style={styles.helperText}>
                Only devices already assigned to rooms are shown here so the ingest request always maps to a valid room.
              </Text>
            </>
          ) : (
            <EmptyState
              description="Register a device and assign it to a room before sending simulated readings."
              title="No ingest-ready devices available"
            />
          )}
          <Field
            autoCapitalize="none"
            label="Timestamp"
            onChangeText={(value) => setForm((current) => ({ ...current, timestamp: value }))}
            placeholder="2026-03-20T10:30:00+08:00"
            value={form.timestamp}
          />
          <Field
            keyboardType="decimal-pad"
            label="Voltage"
            onChangeText={(value) => setForm((current) => ({ ...current, voltage: value }))}
            value={form.voltage}
          />
          <Field
            keyboardType="decimal-pad"
            label="Current"
            onChangeText={(value) => setForm((current) => ({ ...current, current: value }))}
            value={form.current}
          />
          <Field
            keyboardType="decimal-pad"
            label="Power (W)"
            onChangeText={(value) => setForm((current) => ({ ...current, power_w: value }))}
            value={form.power_w}
          />
          <Field
            keyboardType="decimal-pad"
            label="Frequency"
            onChangeText={(value) => setForm((current) => ({ ...current, frequency: value }))}
            value={form.frequency}
          />
          <Field
            keyboardType="decimal-pad"
            label="Power factor"
            onChangeText={(value) => setForm((current) => ({ ...current, power_factor: value }))}
            value={form.power_factor}
          />
          <Field
            keyboardType="decimal-pad"
            label="THD percentage"
            onChangeText={(value) =>
              setForm((current) => ({ ...current, thd_percentage: value }))
            }
            value={form.thd_percentage}
          />
          <Field
            keyboardType="decimal-pad"
            label="Energy (kWh)"
            onChangeText={(value) => setForm((current) => ({ ...current, energy_kwh: value }))}
            value={form.energy_kwh}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          <Button label="Send reading" loading={sending} onPress={() => void handleSend()} />
        </SectionCard>

        {result ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Latest ingest result</Text>
            <Text style={styles.resultHeadline}>{result.reading.roomName}</Text>
            <Text style={styles.helperText}>
              Device {result.reading.deviceIdentifier} · {formatDateTime(result.reading.timestamp)}
            </Text>
            <Text style={styles.helperText}>
              {formatNumber(result.reading.powerW, 'W')} · {formatNumber(result.reading.energyKwh, 'kWh')}
            </Text>
            <Text style={styles.helperText}>
              Running room cost: {formatCurrency(result.estimatedCost)}
            </Text>
            <Text style={styles.helperText}>
              Based on the latest cumulative room kWh reading, not monthly billing and not per-appliance cost.
            </Text>
            <Text style={styles.helperText}>
              Appliance: {result.detection?.applianceTypeName || 'No confident match'}
            </Text>
            <Text style={styles.helperText}>
              Confidence: {formatConfidence(result.detection?.confidence)}
            </Text>
          </SectionCard>
        ) : null}
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
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  resultHeadline: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
});

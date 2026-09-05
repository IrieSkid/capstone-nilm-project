import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest, getErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { MonitoringRoom } from '@/types/models';
import { formatDateTime, formatNumber } from '@/utils/format';
import { theme } from '@/utils/theme';

export default function RoomsScreen() {
  const { user, token, logout } = useAuth();
  const [rooms, setRooms] = useState<MonitoringRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setError(null);
    try {
      setRooms(await apiRequest<MonitoringRoom[]>('/monitoring/rooms', { token }));
    } catch (requestError) {
      if (!quiet) setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRooms();
    const interval = setInterval(() => void loadRooms(true), 10000);
    return () => clearInterval(interval);
  }, [loadRooms]);

  if (!user || !token) return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.primary} onRefresh={() => { setRefreshing(true); void loadRooms(); }} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>MONITORING LOCATIONS</Text>
            <Text style={styles.title}>Select a room</Text>
            <Text style={styles.subtitle}>{user.userName} · {user.roleName}</Text>
          </View>
          <Button label="Log out" variant="secondary" onPress={() => void logout()} style={styles.logout} />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Single-channel prototype</Text>
          <Text style={styles.noticeText}>Each room currently represents one PZEM measurement channel. Channel expansion will follow the approved multi-PZEM schematic.</Text>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><Button label="Retry" variant="secondary" onPress={() => void loadRooms()} /></View> : null}
        {loading ? <ActivityIndicator color={theme.colors.primary} size="large" style={styles.loader} /> : null}
        {!loading && !rooms.length && !error ? <Text style={styles.empty}>No monitoring rooms are assigned to this account.</Text> : null}

        <View style={styles.roomList}>
          {rooms.map((room) => (
            <Pressable
              accessibilityRole="button"
              key={room.roomId}
              onPress={() => router.push({ pathname: '/monitor', params: { roomId: String(room.roomId) } })}
              style={({ pressed }) => [styles.roomCard, pressed && styles.pressed]}
            >
              <View style={styles.roomTop}>
                <View style={styles.roomIdentity}>
                  <Text style={styles.roomName}>{room.roomName}</Text>
                  <Text style={styles.device}>{room.deviceIdentifier ?? 'No device assigned'}</Text>
                </View>
                <StatusBadge status={room.deviceStatus} />
              </View>
              <View style={styles.readingRow}>
                <View><Text style={styles.metricLabel}>LATEST POWER</Text><Text style={styles.metricValue}>{formatNumber(room.latestPowerW, 'W')}</Text></View>
                <View><Text style={styles.metricLabel}>METER ENERGY</Text><Text style={styles.metricValue}>{formatNumber(room.latestEnergyKwh, 'kWh', 4)}</Text></View>
              </View>
              <Text style={styles.timestamp}>Last reading: {formatDateTime(room.latestReadingAt)}</Text>
              <Text style={styles.open}>OPEN DASHBOARD →</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, textTransform: 'capitalize' },
  logout: { minHeight: 40, paddingHorizontal: 13 },
  notice: { borderLeftColor: theme.colors.primary, borderLeftWidth: 4, backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm, padding: 14, gap: 5 },
  noticeTitle: { color: theme.colors.text, fontWeight: '800' },
  noticeText: { color: theme.colors.textMuted, lineHeight: 19, fontSize: 13 },
  errorBox: { gap: 12, backgroundColor: '#361D24', borderColor: theme.colors.danger, borderWidth: 1, borderRadius: theme.radius.md, padding: 16 },
  error: { color: theme.colors.danger },
  loader: { marginTop: 40 },
  empty: { color: theme.colors.textMuted, textAlign: 'center', marginTop: 40 },
  roomList: { gap: 14 },
  roomCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, padding: 17, gap: 15 },
  pressed: { opacity: 0.75 },
  roomTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  roomIdentity: { flex: 1, gap: 4 },
  roomName: { color: theme.colors.text, fontSize: 21, fontWeight: '900' },
  device: { color: theme.colors.textMuted, fontSize: 13 },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderTopColor: theme.colors.line, borderTopWidth: 1, borderBottomColor: theme.colors.line, borderBottomWidth: 1 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  metricValue: { color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  timestamp: { color: theme.colors.textMuted, fontSize: 12 },
  open: { color: theme.colors.primary, fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
});

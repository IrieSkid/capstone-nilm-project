import { StyleSheet, Text, View } from 'react-native';

import { DeviceStatus } from '@/types/models';
import { theme } from '@/utils/theme';

export function StatusBadge({ status }: { status: DeviceStatus }) {
  const color = status === 'online' ? theme.colors.success : status === 'offline' ? theme.colors.danger : theme.colors.warning;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
});

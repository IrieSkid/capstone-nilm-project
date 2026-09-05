import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/utils/theme';

export function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.card, accent && styles.accent]}>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '48.5%', minHeight: 98, backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, padding: 14, justifyContent: 'space-between' },
  accent: { borderColor: theme.colors.primary, backgroundColor: '#11303D' },
  label: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  value: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
});

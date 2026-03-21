import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { theme } from '../utils/theme';

export function LoadingView({ label = 'Loading system...' }: { label?: string }) {
  return (
    <View style={styles.wrapper}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    gap: 14,
    padding: 24,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 15,
  },
});

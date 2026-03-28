import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '../utils/theme';

export function SectionCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    padding: 18,
    gap: 16,
    shadowColor: theme.colors.background,
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
});

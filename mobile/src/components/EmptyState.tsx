import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../utils/theme';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.line,
    padding: 18,
    gap: 6,
    backgroundColor: theme.colors.surfaceMuted,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
});

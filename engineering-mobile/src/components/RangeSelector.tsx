import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { theme } from '@/utils/theme';

export function RangeSelector<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable key={option} onPress={() => onChange(option)} style={[styles.option, selected && styles.selected]}>
            <Text style={[styles.text, selected && styles.selectedText]}>{option.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  option: { borderRadius: 999, borderColor: theme.colors.line, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: theme.colors.surface },
  selected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  text: { color: theme.colors.textMuted, fontWeight: '800', fontSize: 12 },
  selectedText: { color: theme.colors.background },
});

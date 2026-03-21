import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { theme } from '../utils/theme';

export function OptionChips<T extends string | number>({
  options,
  selectedValue,
  onSelect,
}: {
  options: Array<{ label: string; value: T }>;
  selectedValue: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {options.map((option) => {
        const selected = selectedValue === option.value;

        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onSelect(option.value)}
            style={[styles.chip, selected ? styles.chipSelected : null]}>
            <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: theme.colors.white,
  },
});

import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '../utils/theme';

export function SelectField<T extends string | number>({
  label,
  error,
  options,
  selectedValue,
  onSelect,
  placeholder = 'Select an option',
}: {
  label: string;
  error?: string | null;
  options: Array<{ label: string; value: T }>;
  selectedValue: T | null;
  onSelect: (value: T) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          onPress={() => setVisible(true)}
          style={[styles.fieldButton, error ? styles.fieldButtonError : null]}>
          <Text
            numberOfLines={1}
            style={[styles.fieldValue, !selectedOption ? styles.placeholderValue : null]}>
            {selectedOption?.label ?? placeholder}
          </Text>
          <Text style={styles.fieldAction}>Choose</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        transparent
        visible={visible}>
        <View style={styles.overlay}>
          <Pressable onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.dialog}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{label}</Text>
                <Text style={styles.subtitle}>Choose one option from the list below.</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeLabel}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.optionList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const selected = option.value === selectedValue;

                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => {
                      onSelect(option.value);
                      setVisible(false);
                    }}
                    style={[styles.optionRow, selected ? styles.optionRowSelected : null]}>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>
                        {option.label}
                      </Text>
                    </View>
                    {selected ? <Text style={styles.selectedMark}>Selected</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  fieldButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldButtonError: {
    borderColor: theme.colors.danger,
  },
  fieldValue: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
  },
  placeholderValue: {
    color: theme.colors.textMuted,
  },
  fieldAction: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(3, 11, 14, 0.76)',
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '82%',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  closeButton: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  optionList: {
    gap: 10,
    padding: 18,
  },
  optionRow: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionRowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryDark,
  },
  optionCopy: {
    flex: 1,
  },
  optionLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: theme.colors.white,
  },
  selectedMark: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});

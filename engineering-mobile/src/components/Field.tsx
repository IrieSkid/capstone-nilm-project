import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { theme } from '@/utils/theme';

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.primary}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.sm, color: theme.colors.text, fontSize: 16, minHeight: 50, paddingHorizontal: 14 },
});

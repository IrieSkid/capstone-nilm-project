import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { theme } from '../utils/theme';

export function Field({
  label,
  error,
  secureTextEntry,
  ...inputProps
}: TextInputProps & { label: string; error?: string | null }) {
  const supportsPasswordToggle = Boolean(secureTextEntry);
  const [passwordHidden, setPasswordHidden] = useState(Boolean(secureTextEntry));

  useEffect(() => {
    setPasswordHidden(Boolean(secureTextEntry));
  }, [secureTextEntry]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, error ? styles.inputError : null]}>
        <TextInput
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          secureTextEntry={supportsPasswordToggle ? passwordHidden : secureTextEntry}
          {...inputProps}
        />
        {supportsPasswordToggle ? (
          <Pressable
            hitSlop={8}
            onPress={() => setPasswordHidden((current) => !current)}
            style={styles.toggleButton}>
            <Text style={styles.toggleText}>{passwordHidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
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
  inputContainer: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  input: {
    color: theme.colors.text,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  toggleButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleText: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
  },
});

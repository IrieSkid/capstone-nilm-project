import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../utils/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}) {
  const palette = {
    primary: {
      backgroundColor: theme.colors.primary,
      color: theme.colors.white,
    },
    secondary: {
      backgroundColor: theme.colors.secondary,
      color: theme.colors.white,
    },
    danger: {
      backgroundColor: theme.colors.danger,
      color: theme.colors.white,
    },
    ghost: {
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
    },
  }[variant];

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: palette.backgroundColor },
        (disabled || loading) && styles.buttonDisabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.color} />
      ) : (
        <Text style={[styles.label, { color: palette.color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius.sm,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
});

import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { theme } from '@/utils/theme';

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={theme.colors.background} /> : <Text style={[styles.label, variant !== 'primary' && styles.lightLabel]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderWidth: 1 },
  primary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
  danger: { backgroundColor: 'transparent', borderColor: theme.colors.danger },
  label: { color: theme.colors.background, fontSize: 15, fontWeight: '800' },
  lightLabel: { color: theme.colors.text },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});

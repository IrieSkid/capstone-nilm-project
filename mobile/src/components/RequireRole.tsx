import { ReactNode } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { RoleName } from '../types/models';
import { runAfterBlur } from '../utils/focus';
import { Button } from './Button';
import { SectionCard } from './SectionCard';
import { theme } from '../utils/theme';

export function RequireRole({
  roles,
  children,
}: {
  roles: RoleName[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!roles.includes(user.roleName)) {
    return (
      <View style={styles.wrapper}>
        <SectionCard>
          <Text style={styles.title}>Access denied</Text>
          <Text style={styles.description}>
            This screen is restricted for your current role. The API still enforces the same rule
            on the backend.
          </Text>
          <Button
            label="Return to dashboard"
            onPress={() =>
              runAfterBlur(() => {
                router.replace('/(app)/dashboard');
              })
            }
          />
        </SectionCard>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  description: {
    color: theme.colors.textMuted,
    lineHeight: 21,
  },
});

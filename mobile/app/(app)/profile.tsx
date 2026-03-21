import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAuth } from '@/src/context/AuthContext';
import { getApiBaseUrl } from '@/src/api/client';
import { formatDateTime } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <ScreenShell
      subtitle="Session details, account info, and a clean logout path for the demo."
      title="Profile">
      <SectionCard>
        <Text style={styles.title}>{user.userName}</Text>
        <Text style={styles.subtitle}>{user.userEmail}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{user.roleName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{user.statusName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{user.userPhone || 'No phone set'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Created</Text>
          <Text style={styles.value}>{formatDateTime(user.createdAt)}</Text>
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.title}>Environment</Text>
        <Text style={styles.subtitle}>API Base URL: {getApiBaseUrl()}</Text>
        <Text style={styles.subtitle}>
          This app keeps the JWT in local storage and refreshes the logged-in user on launch.
        </Text>
        <View style={styles.buttonColumn}>
          <Button label="Refresh profile" onPress={() => void refreshUser()} variant="ghost" />
          <Button label="Logout" onPress={() => void logout()} variant="danger" />
        </View>
      </SectionCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textMuted,
    lineHeight: 21,
  },
  infoRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: 12,
    gap: 4,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonColumn: {
    gap: 10,
  },
});

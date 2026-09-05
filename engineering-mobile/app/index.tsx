import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { theme } from '@/utils/theme';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} size="large" /></View>;
  return <Redirect href={user ? '/rooms' : '/login'} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background } });

import { Redirect, Stack } from 'expo-router';

import { LoadingView } from '@/src/components/LoadingView';
import { useAuth } from '@/src/context/AuthContext';

export default function AppLayout() {
  const { loading, user } = useAuth();

  if (loading) {
    return <LoadingView />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="users" />
      <Stack.Screen name="rooms" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="simulator" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}

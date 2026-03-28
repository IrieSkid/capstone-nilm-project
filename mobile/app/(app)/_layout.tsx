import { Redirect, Stack } from 'expo-router';

import { LoadingView } from '@/src/components/LoadingView';
import { useAuth } from '@/src/context/AuthContext';
import { theme } from '@/src/utils/theme';

export default function AppLayout() {
  const { loading, user } = useAuth();

  if (loading) {
    return <LoadingView />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        contentStyle: { backgroundColor: theme.colors.background },
      }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="billing" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="billing-notifications" />
      <Stack.Screen name="users" />
      <Stack.Screen name="rooms" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="landlord-rooms" />
      <Stack.Screen name="landlord-room-detail" />
      <Stack.Screen name="landlord-tenants" />
      <Stack.Screen name="landlord-tenant-requests" />
      <Stack.Screen name="landlord-devices" />
      <Stack.Screen name="landlord-billing" />
      <Stack.Screen name="access-control" />
      <Stack.Screen name="simulator" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}

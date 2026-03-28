import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AlertProvider } from '@/src/context/AlertContext';
import { AuthProvider } from '@/src/context/AuthContext';
import { NotificationSummaryProvider } from '@/src/context/NotificationSummaryContext';
import { theme } from '@/src/utils/theme';

export default function RootLayout() {
  return (
    <AlertProvider>
      <AuthProvider>
        <NotificationSummaryProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'none',
              contentStyle: { backgroundColor: theme.colors.background },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(app)" />
          </Stack>
          <StatusBar style="light" />
        </NotificationSummaryProvider>
      </AuthProvider>
    </AlertProvider>
  );
}

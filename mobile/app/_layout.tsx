import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AlertProvider } from '@/src/context/AlertContext';
import { AuthProvider } from '@/src/context/AuthContext';

export default function RootLayout() {
  return (
    <AlertProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </AlertProvider>
  );
}

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiBaseUrl, getErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { useAuth } from '@/context/AuthContext';
import { theme } from '@/utils/theme';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/rooms" />;

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/rooms');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandMark}><Text style={styles.brandSymbol}>∿</Text></View>
          <Text style={styles.eyebrow}>PZEM-004T ENGINEERING CONSOLE</Text>
          <Text style={styles.title}>Residential load monitoring</Text>
          <Text style={styles.subtitle}>Sign in to select a room and inspect live electrical measurements, history, projections, and reports.</Text>

          <View style={styles.panel}>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void submit()} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Open monitoring console" onPress={() => void submit()} loading={submitting} />
          </View>

          <Text style={styles.server}>Server: {getApiBaseUrl()}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  brandMark: { width: 58, height: 58, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  brandSymbol: { color: theme.colors.background, fontSize: 38, fontWeight: '900' },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: theme.colors.text, fontSize: 34, lineHeight: 39, fontWeight: '900', maxWidth: 420 },
  subtitle: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 23, maxWidth: 520 },
  panel: { marginTop: 12, backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.lg, padding: 20, gap: 16 },
  error: { color: theme.colors.danger, lineHeight: 20 },
  server: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 },
});

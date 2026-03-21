import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '@/src/components/Button';
import { Field } from '@/src/components/Field';
import { SectionCard } from '@/src/components/SectionCard';
import { useAuth } from '@/src/context/AuthContext';
import { getErrorMessage } from '@/src/utils/errors';
import { runAfterBlur } from '@/src/utils/focus';
import { theme } from '@/src/utils/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState('admin@nilm.local');
  const [password, setPassword] = useState('Admin123!');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Redirect href="/(app)/dashboard" />;
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await login(email.trim(), password);
      runAfterBlur(() => {
        router.replace('/(app)/dashboard');
      });
    } catch (loginError) {
      setError(getErrorMessage(loginError, 'Unable to log in.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={[...theme.gradients.hero]} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboard}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CAPSTONE PROJECT</Text>
          <Text style={styles.title}>AppliSense</Text>
          <Text style={styles.subtitle}>
            Smart Appliance Detection and Energy Monitoring Using Non-Intrusive Load Analysis.
          </Text>
        </View>

        <SectionCard>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Field
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="admin@nilm.local"
            textContentType="username"
            value={email}
          />
          <Field
            autoComplete="current-password"
            label="Password"
            onChangeText={setPassword}
            placeholder="Enter password"
            secureTextEntry
            textContentType="password"
            value={password}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Login" loading={submitting} onPress={handleLogin} />
        </SectionCard>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 18,
  },
  hero: {
    gap: 8,
    marginBottom: 16,
  },
  eyebrow: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.white,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: theme.colors.white,
    lineHeight: 22,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
});

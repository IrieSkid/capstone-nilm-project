import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { User } from '@/src/types/models';
import { getErrorMessage, getFieldErrors } from '@/src/utils/errors';
import { runAfterBlur } from '@/src/utils/focus';
import { getDefaultAppPath } from '@/src/utils/navigation';
import { getPhilippinePhoneMessage, isValidPhilippinePhone, normalizePhilippinePhone } from '@/src/utils/phone';
import { theme } from '@/src/utils/theme';

const emptyRegisterForm = {
  user_name: '',
  user_email: '',
  user_phone: '',
  landlord_registration_code: '',
  user_password: '',
  confirm_password: '',
};

const emptyForgotPasswordForm = {
  user_email: '',
  user_phone: '',
  new_password: '',
  confirm_new_password: '',
};

type RegisterForm = typeof emptyRegisterForm;
type ForgotPasswordForm = typeof emptyForgotPasswordForm;

type RegisterFieldName = keyof RegisterForm;
type ForgotFieldName = keyof ForgotPasswordForm;

type RegisterErrors = Partial<Record<RegisterFieldName, string>>;
type ForgotPasswordErrors = Partial<Record<ForgotFieldName, string>>;

function validateRegisterForm(form: RegisterForm) {
  const errors: RegisterErrors = {};

  if (form.user_name.trim().length < 2) {
    errors.user_name = 'Enter at least 2 characters.';
  }

  if (!form.user_email.trim()) {
    errors.user_email = 'Enter your email address.';
  } else if (!/\S+@\S+\.\S+/.test(form.user_email.trim())) {
    errors.user_email = 'Please enter a valid email address.';
  }

  if (!form.user_phone.trim()) {
    errors.user_phone = 'Enter your phone number.';
  } else if (!isValidPhilippinePhone(form.user_phone)) {
    errors.user_phone = getPhilippinePhoneMessage();
  }

  if (!form.landlord_registration_code.trim()) {
    errors.landlord_registration_code = 'Enter your landlord invite code.';
  }

  if (form.user_password.length < 8) {
    errors.user_password = 'Password must be at least 8 characters.';
  }

  if (form.confirm_password !== form.user_password) {
    errors.confirm_password = 'Passwords do not match.';
  }

  return errors;
}

function validateForgotPasswordForm(form: ForgotPasswordForm) {
  const errors: ForgotPasswordErrors = {};

  if (!form.user_email.trim()) {
    errors.user_email = 'Enter your email address.';
  } else if (!/\S+@\S+\.\S+/.test(form.user_email.trim())) {
    errors.user_email = 'Please enter a valid email address.';
  }

  if (!form.user_phone.trim()) {
    errors.user_phone = 'Enter your phone number.';
  } else if (!isValidPhilippinePhone(form.user_phone)) {
    errors.user_phone = getPhilippinePhoneMessage();
  }

  if (form.new_password.length < 8) {
    errors.new_password = 'New password must be at least 8 characters.';
  }

  if (form.confirm_new_password !== form.new_password) {
    errors.confirm_new_password = 'Passwords do not match.';
  }

  return errors;
}

export default function LoginScreen() {
  const router = useRouter();
  const { showError, showSuccess } = useAppAlert();
  const { user, login, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginErrors, setLoginErrors] = useState<Partial<Record<'email' | 'password', string>>>({});

  const [registerVisible, setRegisterVisible] = useState(false);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerErrors, setRegisterErrors] = useState<RegisterErrors>({});
  const [registerForm, setRegisterForm] = useState<RegisterForm>(emptyRegisterForm);

  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotErrors, setForgotErrors] = useState<ForgotPasswordErrors>({});
  const [forgotForm, setForgotForm] = useState<ForgotPasswordForm>(emptyForgotPasswordForm);

  if (!loading && user) {
    return <Redirect href={getDefaultAppPath(user)} />;
  }

  function updateRegisterField(field: RegisterFieldName, value: string) {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
    setRegisterErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  }

  function updateForgotField(field: ForgotFieldName, value: string) {
    setForgotForm((current) => ({
      ...current,
      [field]: value,
    }));
    setForgotErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  }

  function closeRegisterModal() {
    setRegisterVisible(false);
    setRegisterError(null);
    setRegisterErrors({});
    setRegisterForm(emptyRegisterForm);
  }

  function closeForgotModal() {
    setForgotVisible(false);
    setForgotError(null);
    setForgotErrors({});
    setForgotForm(emptyForgotPasswordForm);
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      const nextError = 'Enter your email and password.';
      setError(nextError);
      setLoginErrors({
        email: !email.trim() ? 'Email is required.' : undefined,
        password: !password.trim() ? 'Password is required.' : undefined,
      });
      showError('Login failed', nextError);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      const nextError = 'Please enter a valid email address.';
      setError(nextError);
      setLoginErrors({ email: nextError });
      showError('Login failed', nextError);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setLoginErrors({});
      const loggedInUser = await login(email.trim(), password);
      runAfterBlur(() => {
        router.replace(getDefaultAppPath(loggedInUser));
      });
    } catch (loginError) {
      const nextError = getErrorMessage(loginError, 'Unable to log in.');
      setError(nextError);
      setLoginErrors(getFieldErrors<'email' | 'password'>(loginError));
      showError('Login failed', nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterTenant() {
    const nextErrors = validateRegisterForm(registerForm);

    if (Object.keys(nextErrors).length > 0) {
      setRegisterErrors(nextErrors);
      setRegisterError('Please correct the highlighted fields.');
      showError('Unable to register', 'Please correct the highlighted fields.');
      return;
    }

    try {
      setRegisterSubmitting(true);
      setRegisterError(null);
      setRegisterErrors({});

      await apiRequest<User>('/auth/register-tenant', {
        method: 'POST',
        body: {
          user_name: registerForm.user_name.trim(),
          user_email: registerForm.user_email.trim(),
          user_phone: normalizePhilippinePhone(registerForm.user_phone),
          landlord_registration_code: registerForm.landlord_registration_code.trim(),
          user_password: registerForm.user_password,
          confirm_password: registerForm.confirm_password,
        },
      });

      setEmail(registerForm.user_email.trim());
      setPassword('');
      closeRegisterModal();
      showSuccess(
        'Registration submitted',
        'Your tenant account is now waiting for landlord approval before you can sign in.',
      );
    } catch (registrationError) {
      const nextError = getErrorMessage(registrationError, 'Unable to register tenant.');
      setRegisterError(nextError);
      setRegisterErrors(getFieldErrors<RegisterFieldName>(registrationError));
      showError('Unable to register', nextError);
    } finally {
      setRegisterSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    const nextErrors = validateForgotPasswordForm(forgotForm);

    if (Object.keys(nextErrors).length > 0) {
      setForgotErrors(nextErrors);
      setForgotError('Please correct the highlighted fields.');
      showError('Unable to reset password', 'Please correct the highlighted fields.');
      return;
    }

    try {
      setForgotSubmitting(true);
      setForgotError(null);
      setForgotErrors({});

      await apiRequest<User>('/auth/forgot-password', {
        method: 'POST',
        body: {
          user_email: forgotForm.user_email.trim(),
          user_phone: normalizePhilippinePhone(forgotForm.user_phone),
          new_password: forgotForm.new_password,
          confirm_new_password: forgotForm.confirm_new_password,
        },
      });

      setEmail(forgotForm.user_email.trim());
      setPassword('');
      closeForgotModal();
      showSuccess(
        'Password reset successful',
        'Your new password is active. Sign in with your updated credentials.',
      );
    } catch (forgotPasswordError) {
      const nextError = getErrorMessage(forgotPasswordError, 'Unable to reset password.');
      setForgotError(nextError);
      setForgotErrors(getFieldErrors<ForgotFieldName>(forgotPasswordError));
      showError('Unable to reset password', nextError);
    } finally {
      setForgotSubmitting(false);
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
            autoComplete="off"
            error={loginErrors.email}
            importantForAutofill="no"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="Enter email"
            value={email}
          />
          <Field
            autoComplete="off"
            error={loginErrors.password}
            importantForAutofill="no"
            label="Password"
            onChangeText={setPassword}
            placeholder="Enter password"
            secureTextEntry
            value={password}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Login" loading={submitting} onPress={handleLogin} />

          <View style={styles.linkActions}>
            <Pressable onPress={() => setForgotVisible(true)} style={styles.linkButton}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
            <Pressable onPress={() => setRegisterVisible(true)} style={styles.linkButton}>
              <Text style={styles.linkText}>Register as tenant</Text>
            </Pressable>
          </View>
        </SectionCard>
      </KeyboardAvoidingView>

      <FormModal
        onClose={closeRegisterModal}
        subtitle="Register under a landlord by entering their invite code. The landlord must approve the request before login is allowed."
        title="Tenant registration"
        visible={registerVisible}>
        <Field
          autoCapitalize="words"
          autoComplete="off"
          error={registerErrors.user_name}
          importantForAutofill="no"
          label="Full name"
          onChangeText={(value) => updateRegisterField('user_name', value)}
          placeholder="Enter full name"
          value={registerForm.user_name}
        />
        <Field
          autoCapitalize="none"
          autoComplete="off"
          error={registerErrors.user_email}
          importantForAutofill="no"
          keyboardType="email-address"
          label="Email"
          onChangeText={(value) => updateRegisterField('user_email', value)}
          placeholder="Enter email"
          value={registerForm.user_email}
        />
        <Field
          autoComplete="off"
          error={registerErrors.user_phone}
          importantForAutofill="no"
          keyboardType="phone-pad"
          label="Phone"
          onChangeText={(value) => updateRegisterField('user_phone', value)}
          placeholder="09171234567"
          value={registerForm.user_phone}
        />
        <Field
          autoCapitalize="characters"
          autoComplete="off"
          error={registerErrors.landlord_registration_code}
          importantForAutofill="no"
          label="Landlord invite code"
          onChangeText={(value) => updateRegisterField('landlord_registration_code', value.toUpperCase())}
          placeholder="Example: LLD-8F4K2M"
          value={registerForm.landlord_registration_code}
        />
        <Field
          autoComplete="new-password"
          error={registerErrors.user_password}
          importantForAutofill="no"
          label="Password"
          onChangeText={(value) => updateRegisterField('user_password', value)}
          placeholder="Enter password"
          secureTextEntry
          value={registerForm.user_password}
        />
        <Field
          autoComplete="new-password"
          error={registerErrors.confirm_password}
          importantForAutofill="no"
          label="Confirm password"
          onChangeText={(value) => updateRegisterField('confirm_password', value)}
          placeholder="Confirm password"
          secureTextEntry
          value={registerForm.confirm_password}
        />
        {registerError ? <Text style={styles.errorText}>{registerError}</Text> : null}
        <View style={styles.modalActions}>
          <Button label="Cancel" onPress={closeRegisterModal} variant="ghost" />
          <Button
            label="Create tenant account"
            loading={registerSubmitting}
            onPress={handleRegisterTenant}
          />
        </View>
      </FormModal>

      <FormModal
        onClose={closeForgotModal}
        subtitle="Verify the active account using its email and phone number, then set a new password."
        title="Forgot password"
        visible={forgotVisible}>
        <Field
          autoCapitalize="none"
          autoComplete="off"
          error={forgotErrors.user_email}
          importantForAutofill="no"
          keyboardType="email-address"
          label="Email"
          onChangeText={(value) => updateForgotField('user_email', value)}
          placeholder="Enter email"
          value={forgotForm.user_email}
        />
        <Field
          autoComplete="off"
          error={forgotErrors.user_phone}
          importantForAutofill="no"
          keyboardType="phone-pad"
          label="Phone"
          onChangeText={(value) => updateForgotField('user_phone', value)}
          placeholder="09171234567"
          value={forgotForm.user_phone}
        />
        <Field
          autoComplete="new-password"
          error={forgotErrors.new_password}
          importantForAutofill="no"
          label="New password"
          onChangeText={(value) => updateForgotField('new_password', value)}
          placeholder="Enter new password"
          secureTextEntry
          value={forgotForm.new_password}
        />
        <Field
          autoComplete="new-password"
          error={forgotErrors.confirm_new_password}
          importantForAutofill="no"
          label="Confirm new password"
          onChangeText={(value) => updateForgotField('confirm_new_password', value)}
          placeholder="Confirm new password"
          secureTextEntry
          value={forgotForm.confirm_new_password}
        />
        {forgotError ? <Text style={styles.errorText}>{forgotError}</Text> : null}
        <View style={styles.modalActions}>
          <Button label="Cancel" onPress={closeForgotModal} variant="ghost" />
          <Button
            label="Reset password"
            loading={forgotSubmitting}
            onPress={handleForgotPassword}
          />
        </View>
      </FormModal>
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
  linkActions: {
    gap: 10,
    marginTop: 4,
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
});

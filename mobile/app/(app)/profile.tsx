import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { apiRequest, getApiBaseUrl } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { User } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

const initialProfileForm = {
  user_name: '',
  user_email: '',
  user_phone: '',
};

const initialPasswordForm = {
  current_password: '',
  new_password: '',
  confirm_new_password: '',
};

export default function ProfileScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { user, token, logout, refreshUser } = useAuth();
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileForm({
      user_name: user.userName,
      user_email: user.userEmail,
      user_phone: user.userPhone || '',
    });
  }, [user]);

  if (!user) {
    return null;
  }

  async function handleProfileSave() {
    if (!token) {
      return;
    }

    if (!profileForm.user_name.trim() || !profileForm.user_email.trim()) {
      const nextError = 'Full name and email are required.';
      setProfileError(nextError);
      showError('Unable to update profile', nextError);
      return;
    }

    try {
      setSavingProfile(true);
      setProfileError(null);
      setProfileMessage(null);

      const updatedUser = await apiRequest<User>('/auth/me', {
        method: 'PATCH',
        token,
        body: {
          user_name: profileForm.user_name.trim(),
          user_email: profileForm.user_email.trim(),
          user_phone: profileForm.user_phone.trim(),
        },
      });

      await refreshUser();
      setProfileForm({
        user_name: updatedUser.userName,
        user_email: updatedUser.userEmail,
        user_phone: updatedUser.userPhone || '',
      });
      setProfileMessage('Profile updated successfully.');
      closeProfileModal();
      showSuccess('Profile updated', 'Your account details were saved successfully.');
    } catch (error) {
      if (isUnauthorized(error)) {
        await logout();
        return;
      }

      const nextError = getErrorMessage(error, 'Unable to update profile.');
      setProfileError(nextError);
      showError('Unable to update profile', nextError);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordChange() {
    if (!token) {
      return;
    }

    if (
      !passwordForm.current_password.trim()
      || !passwordForm.new_password.trim()
      || !passwordForm.confirm_new_password.trim()
    ) {
      const nextError = 'Current password, new password, and confirm password are required.';
      setPasswordError(nextError);
      showError('Unable to change password', nextError);
      return;
    }

    if (passwordForm.new_password.trim().length < 8) {
      const nextError = 'New password must be at least 8 characters long.';
      setPasswordError(nextError);
      showError('Unable to change password', nextError);
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_new_password) {
      const nextError = 'New password and confirm password must match.';
      setPasswordError(nextError);
      showError('Unable to change password', nextError);
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordError(null);
      setPasswordMessage(null);

      await apiRequest<User>('/auth/change-password', {
        method: 'PATCH',
        token,
        body: {
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
          confirm_new_password: passwordForm.confirm_new_password,
        },
      });

      setPasswordForm(initialPasswordForm);
      setPasswordMessage('Password changed successfully.');
      closePasswordModal();
      showSuccess('Password changed', 'Your new password is active for the next login.');
    } catch (error) {
      if (isUnauthorized(error)) {
        await logout();
        return;
      }

      const nextError = getErrorMessage(error, 'Unable to change password.');
      setPasswordError(nextError);
      showError('Unable to change password', nextError);
    } finally {
      setSavingPassword(false);
    }
  }

  function closeProfileModal() {
    if (!user) {
      return;
    }

    setProfileForm({
      user_name: user.userName,
      user_email: user.userEmail,
      user_phone: user.userPhone || '',
    });
    setProfileError(null);
    setIsProfileModalVisible(false);
  }

  function openProfileModal() {
    if (!user) {
      return;
    }

    setProfileMessage(null);
    setProfileError(null);
    setProfileForm({
      user_name: user.userName,
      user_email: user.userEmail,
      user_phone: user.userPhone || '',
    });
    setIsProfileModalVisible(true);
  }

  function closePasswordModal() {
    setPasswordForm(initialPasswordForm);
    setPasswordError(null);
    setIsPasswordModalVisible(false);
  }

  function openPasswordModal() {
    setPasswordMessage(null);
    setPasswordError(null);
    setPasswordForm(initialPasswordForm);
    setIsPasswordModalVisible(true);
  }

  async function handleLogout() {
    await logout();
    showSuccess(
      'Logout successful',
      'Your session has been cleared and you have been signed out safely.',
    );
  }

  return (
    <ScreenShell
      subtitle="Update your account details, manage password security, and keep your demo session ready."
      title="Profile & Security">
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
        <Text style={styles.sectionTitle}>Account actions</Text>
        <Text style={styles.subtitle}>
          Open the profile and password forms only when you need to make account changes.
        </Text>
        {profileMessage ? <Text style={styles.successText}>{profileMessage}</Text> : null}
        {passwordMessage ? <Text style={styles.successText}>{passwordMessage}</Text> : null}
        {profileError && !isProfileModalVisible ? <Text style={styles.errorText}>{profileError}</Text> : null}
        {passwordError && !isPasswordModalVisible ? <Text style={styles.errorText}>{passwordError}</Text> : null}
        <View style={styles.buttonColumn}>
          <Button label="Edit profile" onPress={openProfileModal} />
          <Button label="Change password" onPress={openPasswordModal} variant="secondary" />
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
          <Button label="Logout" onPress={() => void handleLogout()} variant="danger" />
        </View>
      </SectionCard>

      <FormModal
        onClose={closeProfileModal}
        subtitle="Update your account details without leaving the Profile screen."
        title="Edit profile"
        visible={isProfileModalVisible}>
        <Field
          autoComplete="name"
          label="Full name"
          onChangeText={(value) => setProfileForm((current) => ({ ...current, user_name: value }))}
          placeholder="Juan Dela Cruz"
          textContentType="name"
          value={profileForm.user_name}
        />
        <Field
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="Email"
          onChangeText={(value) => setProfileForm((current) => ({ ...current, user_email: value }))}
          placeholder="tenant@nilm.local"
          textContentType="emailAddress"
          value={profileForm.user_email}
        />
        <Field
          autoComplete="tel"
          keyboardType="phone-pad"
          label="Phone"
          onChangeText={(value) => setProfileForm((current) => ({ ...current, user_phone: value }))}
          placeholder="09170000000"
          textContentType="telephoneNumber"
          value={profileForm.user_phone}
        />
        {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
        <View style={styles.buttonColumn}>
          <Button
            label="Save profile"
            loading={savingProfile}
            onPress={() => void handleProfileSave()}
          />
          <Button label="Cancel" onPress={closeProfileModal} variant="ghost" />
        </View>
      </FormModal>

      <FormModal
        onClose={closePasswordModal}
        subtitle="Confirm your current password before setting a new one."
        title="Change password"
        visible={isPasswordModalVisible}>
        <Field
          autoComplete="current-password"
          label="Current password"
          onChangeText={(value) =>
            setPasswordForm((current) => ({ ...current, current_password: value }))
          }
          placeholder="Enter current password"
          secureTextEntry
          textContentType="password"
          value={passwordForm.current_password}
        />
        <Field
          autoComplete="new-password"
          label="New password"
          onChangeText={(value) =>
            setPasswordForm((current) => ({ ...current, new_password: value }))
          }
          placeholder="Minimum 8 characters"
          secureTextEntry
          textContentType="newPassword"
          value={passwordForm.new_password}
        />
        <Field
          autoComplete="new-password"
          label="Confirm new password"
          onChangeText={(value) =>
            setPasswordForm((current) => ({ ...current, confirm_new_password: value }))
          }
          placeholder="Re-enter new password"
          secureTextEntry
          textContentType="newPassword"
          value={passwordForm.confirm_new_password}
        />
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
        <View style={styles.buttonColumn}>
          <Button
            label="Change password"
            loading={savingPassword}
            onPress={() => void handlePasswordChange()}
            variant="secondary"
          />
          <Button label="Cancel" onPress={closePasswordModal} variant="ghost" />
        </View>
      </FormModal>
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
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
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
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
  successText: {
    color: theme.colors.success,
    fontWeight: '600',
  },
});

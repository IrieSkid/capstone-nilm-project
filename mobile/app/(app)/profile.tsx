import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { apiRequest, getApiBaseUrl } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { NotificationPreferencesData, User } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime, formatDisplayLabel, formatStatusLabel } from '@/src/utils/format';
import { getPhilippinePhoneMessage, isValidPhilippinePhone, normalizePhilippinePhone } from '@/src/utils/phone';
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
  const [refreshing, setRefreshing] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [isNotificationPreferencesModalVisible, setIsNotificationPreferencesModalVisible] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferencesData | null>(null);
  const [loadingNotificationPreferences, setLoadingNotificationPreferences] = useState(false);
  const [savingNotificationPreferenceKey, setSavingNotificationPreferenceKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    void loadNotificationPreferences();
  }, [token, user]);

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

    if (profileForm.user_phone.trim() && !isValidPhilippinePhone(profileForm.user_phone)) {
      const nextError = getPhilippinePhoneMessage();
      setProfileError(nextError);
      showError('Unable to update profile', nextError);
      return;
    }

    try {
      setSavingProfile(true);
      setProfileError(null);

      const updatedUser = await apiRequest<User>('/auth/me', {
        method: 'PATCH',
        token,
        body: {
          user_name: profileForm.user_name.trim(),
          user_email: profileForm.user_email.trim(),
          user_phone: profileForm.user_phone.trim()
            ? normalizePhilippinePhone(profileForm.user_phone)
            : '',
        },
      });

      await refreshUser();
      setProfileForm({
        user_name: updatedUser.userName,
        user_email: updatedUser.userEmail,
        user_phone: updatedUser.userPhone || '',
      });
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

  async function handleRefresh() {
    try {
      setRefreshing(true);
      await refreshUser();
    } catch (refreshError) {
      if (isUnauthorized(refreshError)) {
        await logout();
        return;
      }

      showError('Unable to refresh profile', getErrorMessage(refreshError, 'Unable to refresh profile.'));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleOpenEmail(email: string) {
    try {
      await Linking.openURL(`mailto:${email}`);
    } catch {
      showError('Unable to open email', 'No email app is available for this action right now.');
    }
  }

  async function handleOpenPhone(phone: string) {
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      showError('Unable to open phone', 'No calling app is available for this action right now.');
    }
  }

  async function handleCopyInviteCode(code: string) {
    try {
      await Clipboard.setStringAsync(code);
      showSuccess('Invite code copied', 'Your landlord invite code was copied to the clipboard.');
    } catch {
      showError('Copy failed', 'Unable to copy the invite code right now.');
    }
  }

  async function loadNotificationPreferences() {
    if (!token) {
      return;
    }

    try {
      setLoadingNotificationPreferences(true);
      setNotificationPreferences(
        await apiRequest<NotificationPreferencesData>('/notifications/preferences', { token }),
      );
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      showError(
        'Unable to load notification preferences',
        getErrorMessage(loadError, 'Unable to load notification preferences.'),
      );
    } finally {
      setLoadingNotificationPreferences(false);
    }
  }

  async function openNotificationPreferencesModal() {
    setIsNotificationPreferencesModalVisible(true);
    await loadNotificationPreferences();
  }

  function closeNotificationPreferencesModal() {
    setIsNotificationPreferencesModalVisible(false);
  }

  async function handleNotificationPreferenceToggle(preferenceKey: string, enabled: boolean) {
    if (!token) {
      return;
    }

    const previousState = notificationPreferences;

    setSavingNotificationPreferenceKey(preferenceKey);
    setNotificationPreferences((current) => {
      if (!current) return current;

      const preferences = current.preferences.map((preference) =>
        preference.key === preferenceKey ? { ...preference, enabled } : preference,
      );

      return {
        ...current,
        summary: {
          ...current.summary,
          enabledPreferences: preferences.filter((preference) => preference.enabled).length,
        },
        preferences,
      };
    });

    try {
      await apiRequest('/notifications/preferences', {
        method: 'PATCH',
        token,
        body: {
          preference_key: preferenceKey,
          enabled,
        },
      });
    } catch (toggleError) {
      if (isUnauthorized(toggleError)) {
        await logout();
        return;
      }

      setNotificationPreferences(previousState);
      showError(
        'Unable to update notification preference',
        getErrorMessage(toggleError, 'Unable to update this notification preference.'),
      );
    } finally {
      setSavingNotificationPreferenceKey(null);
    }
  }

  const notificationPreferenceGroups = notificationPreferences?.preferences.reduce<Record<string, NotificationPreferencesData['preferences']>>(
    (groups, preference) => {
      const currentGroup = groups[preference.category] ?? [];
      currentGroup.push(preference);
      groups[preference.category] = currentGroup;
      return groups;
    },
    {},
  ) ?? {};

  return (
    <RequireRole roles={['admin', 'landlord', 'tenant']} permissionKey="profile.manage">
      <ScreenShell
        onRefresh={() => void handleRefresh()}
        refreshing={refreshing}
        subtitle="View your account, landlord relationship, and session details in one calm place."
        title="My Account">
        <SectionCard>
          <View style={styles.identityBlock}>
            <Text style={styles.title}>{user.userName}</Text>
            <Text style={styles.subtitle}>{user.userEmail}</Text>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>Role</Text>
              <Text style={styles.badgeValue}>{formatDisplayLabel(user.roleName)}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>Status</Text>
              <Text style={styles.badgeValue}>{formatStatusLabel(user.statusName)}</Text>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <View style={styles.detailCard}>
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.value}>{user.userPhone || 'No phone set'}</Text>
            </View>
            <View style={styles.detailCard}>
              <Text style={styles.label}>Member since</Text>
              <Text style={styles.value}>{formatDateTime(user.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.accountActionRow}>
            <Pressable
              onPress={openProfileModal}
              style={[styles.accountActionButton, styles.accountActionButtonPrimary]}>
              <Text style={styles.accountActionLabel}>Edit details</Text>
              <Text style={styles.accountActionHint}>Profile info</Text>
            </Pressable>
            <Pressable
              onPress={openPasswordModal}
              style={[styles.accountActionButton, styles.accountActionButtonSecondary]}>
              <Text style={styles.accountActionLabel}>Change password</Text>
              <Text style={styles.accountActionHint}>Security</Text>
            </Pressable>
          </View>
        </SectionCard>

        {user.roleName === 'tenant' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Landlord support</Text>
            <Text style={styles.subtitle}>
              Your account is currently linked to this landlord for room approval and support.
            </Text>
            <View style={styles.detailCard}>
              <Text style={styles.label}>Landlord</Text>
              <Text style={styles.value}>{user.landlordOwnerName || 'No landlord assigned'}</Text>
              {user.landlordOwnerEmail ? (
                <Pressable onPress={() => void handleOpenEmail(user.landlordOwnerEmail as string)}>
                  <Text style={styles.contactLink}>{user.landlordOwnerEmail}</Text>
                </Pressable>
              ) : null}
              {user.landlordOwnerPhone ? (
                <Pressable onPress={() => void handleOpenPhone(user.landlordOwnerPhone as string)}>
                  <Text style={styles.contactLink}>{user.landlordOwnerPhone}</Text>
                </Pressable>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        {user.roleName === 'landlord' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Tenant invite</Text>
            <Text style={styles.subtitle}>
              Share your landlord invite code with tenants so they can register under your account. You can approve or reject them from the Requests screen.
            </Text>
            <View style={styles.inviteCard}>
              <Text style={styles.label}>Invite code</Text>
              <View style={styles.inviteCodeRow}>
                <Text style={styles.title}>{user.landlordRegistrationCode || 'No code assigned yet'}</Text>
                {user.landlordRegistrationCode ? (
                  <Pressable
                    android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
                    onPress={() => void handleCopyInviteCode(user.landlordRegistrationCode as string)}
                    style={({ hovered, pressed }) => [
                      styles.inlineCopyButton,
                      (pressed || hovered) ? styles.inlineCopyButtonActive : null,
                    ]}>
                    <MaterialIcons color={theme.colors.primary} name="content-copy" size={16} />
                    <Text style={styles.inlineCopyButtonLabel}>Copy</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </SectionCard>
        ) : null}

        {user.roleName === 'landlord' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Admin support</Text>
            <Text style={styles.subtitle}>
              Contact admin support for room ownership issues, device setup, approvals, or account access concerns.
            </Text>
            <View style={styles.detailCard}>
              <Text style={styles.label}>Support contact</Text>
              <Text style={styles.value}>{user.adminSupportName || 'No admin support contact assigned'}</Text>
              {user.adminSupportEmail ? (
                <Pressable onPress={() => void handleOpenEmail(user.adminSupportEmail as string)}>
                  <Text style={styles.contactLink}>{user.adminSupportEmail}</Text>
                </Pressable>
              ) : null}
              {user.adminSupportPhone ? (
                <Pressable onPress={() => void handleOpenPhone(user.adminSupportPhone as string)}>
                  <Text style={styles.contactLink}>{user.adminSupportPhone}</Text>
                </Pressable>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        <SectionCard>
          <Text style={styles.sectionTitle}>Notification preferences</Text>
          <Text style={styles.subtitle}>
            Choose which alerts should stay active for this account as device, billing, and safety notifications grow.
          </Text>
          <View style={styles.preferenceSummaryCard}>
            <Text style={styles.label}>Enabled alerts</Text>
            <Text style={styles.value}>
              {notificationPreferences?.summary.enabledPreferences ?? '...'} / {notificationPreferences?.summary.totalPreferences ?? '...'}
            </Text>
          </View>
          <View style={styles.singleActionRow}>
            <Button
              label="Manage notification preferences"
              onPress={() => void openNotificationPreferencesModal()}
              variant="ghost"
            />
          </View>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Session</Text>
          <Text style={styles.subtitle}>
            Stay signed in on this device, or sign out safely when you are finished. Pull down to refresh account details any time.
          </Text>
          <View style={styles.subtleActionRow}>
            <Pressable
              disabled={refreshing}
              onPress={() => void handleRefresh()}
              style={[styles.subtleAction, refreshing && styles.actionDisabled]}>
              <Text style={styles.subtleActionLabel}>
                {refreshing ? 'Refreshing...' : 'Refresh details'}
              </Text>
            </Pressable>
            <Pressable onPress={() => void handleLogout()} style={styles.destructiveAction}>
              <Text style={styles.destructiveActionLabel}>Logout</Text>
            </Pressable>
          </View>
          <Text style={styles.appNote}>App connection: {getApiBaseUrl()}</Text>
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

        <FormModal
          onClose={closeNotificationPreferencesModal}
          subtitle="Turn alerts on or off for this account. These preferences apply to future notifications only."
          title="Notification preferences"
          visible={isNotificationPreferencesModalVisible}>
          {loadingNotificationPreferences && !notificationPreferences ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : null}

          {Object.entries(notificationPreferenceGroups).map(([category, preferences]) => (
            <View key={category} style={styles.preferenceGroup}>
              <Text style={styles.sectionTitle}>{formatDisplayLabel(category)}</Text>
              {preferences.map((preference) => (
                <View key={preference.key} style={styles.preferenceRow}>
                  <View style={styles.preferenceTextBlock}>
                    <Text style={styles.preferenceTitle}>{preference.label}</Text>
                    <Text style={styles.helperText}>{preference.description}</Text>
                  </View>
                  <Switch
                    disabled={savingNotificationPreferenceKey === preference.key}
                    onValueChange={(value) =>
                      void handleNotificationPreferenceToggle(preference.key, value)}
                    thumbColor={preference.enabled ? theme.colors.white : '#E7ECEE'}
                    trackColor={{
                      false: theme.colors.danger,
                      true: theme.colors.primary,
                    }}
                    value={preference.enabled}
                  />
                </View>
              ))}
            </View>
          ))}

          {!loadingNotificationPreferences && !notificationPreferences?.preferences.length ? (
            <Text style={styles.helperText}>No notification preferences are available for this account yet.</Text>
          ) : null}

          <View style={styles.buttonColumn}>
            <Button label="Done" onPress={closeNotificationPreferencesModal} variant="ghost" />
          </View>
        </FormModal>
      </ScreenShell>
    </RequireRole>
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
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  supportingText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  contactLink: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  identityBlock: {
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    flex: 1,
    minHeight: 72,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  badgeLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  detailCard: {
    flex: 1,
    minHeight: 86,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.overlaySoft,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  inviteCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.overlaySoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  inviteCodeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
  inlineCopyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(79,163,181,0.32)',
    backgroundColor: 'rgba(79,163,181,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineCopyButtonActive: {
    backgroundColor: 'rgba(79,163,181,0.14)',
    borderColor: 'rgba(79,163,181,0.42)',
  },
  inlineCopyButtonLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonColumn: {
    gap: 10,
  },
  singleActionRow: {
    paddingTop: 4,
  },
  preferenceSummaryCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.overlaySoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  preferenceGroup: {
    gap: 10,
  },
  preferenceRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.overlaySoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preferenceTextBlock: {
    flex: 1,
    gap: 4,
  },
  preferenceTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  accountActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accountActionButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
    ...Platform.select({
      android: {
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
      },
      default: {
        shadowColor: '#000000',
        shadowOpacity: 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      },
    }),
  },
  accountActionButtonPrimary: {
    backgroundColor: Platform.OS === 'android' ? '#244F5B' : theme.colors.primaryDark,
    borderColor: theme.colors.primary,
  },
  accountActionButtonSecondary: {
    backgroundColor: Platform.OS === 'android' ? '#2A4B4D' : 'rgba(127,209,200,0.18)',
    borderColor: theme.colors.secondary,
  },
  accountActionLabel: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  accountActionHint: {
    color: 'rgba(230,240,242,0.74)',
    fontSize: 12,
    fontWeight: '600',
  },
  subtleActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  subtleAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.overlaySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  subtleActionLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  destructiveAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  destructiveActionLabel: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  actionDisabled: {
    opacity: 0.7,
  },
  appNote: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
});

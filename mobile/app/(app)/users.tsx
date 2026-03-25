import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { UsersPayload } from '@/src/types/models';
import { getErrorMessage, getFieldErrors, isUnauthorized } from '@/src/utils/errors';
import { theme } from '@/src/utils/theme';

const initialForm = {
  user_name: '',
  user_email: '',
  user_phone: '',
  user_password: '',
  confirm_user_password: '',
  role_name: 'tenant',
  status_name: 'active',
};

type UserFieldErrors = Partial<
  Record<
    'user_name' | 'user_email' | 'user_phone' | 'user_password' | 'confirm_user_password' | 'role_name' | 'status_name',
    string
  >
>;

export default function UsersScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout } = useAuth();
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});

  const loadUsers = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<UsersPayload>('/users', { token });
      setPayload(data);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load users.'));
    } finally {
      setLoading(false);
    }
  }, [logout, token]);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers]),
  );

  async function handleSubmit() {
    if (!token) {
      return;
    }

    if (!form.user_name.trim() || !form.user_email.trim()) {
      const nextError = 'Name and email are required.';
      setError(nextError);
      setFieldErrors({
        user_name: !form.user_name.trim() ? 'Name is required.' : undefined,
        user_email: !form.user_email.trim() ? 'Email is required.' : undefined,
      });
      showError('Unable to save user', nextError);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(form.user_email.trim())) {
      const nextError = 'Please enter a valid email address.';
      setError(nextError);
      setFieldErrors({ user_email: nextError });
      showError('Unable to save user', nextError);
      return;
    }

    if (!editingUserId && form.user_password.trim().length < 8) {
      const nextError = 'A password with at least 8 characters is required for new users.';
      setError(nextError);
      setFieldErrors({ user_password: nextError });
      showError('Unable to save user', nextError);
      return;
    }

    if (!editingUserId && form.user_password !== form.confirm_user_password) {
      const nextError = 'Password and confirm password must match.';
      setError(nextError);
      setFieldErrors({ confirm_user_password: nextError });
      showError('Unable to save user', nextError);
      return;
    }

    if (editingUserId && form.user_password.trim() && form.user_password !== form.confirm_user_password) {
      const nextError = 'New password and confirm password must match.';
      setError(nextError);
      setFieldErrors({ confirm_user_password: nextError });
      showError('Unable to save user', nextError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setFieldErrors({});
      setMessage(null);
      let successTitle = '';
      let successMessage = '';

      if (editingUserId) {
        await apiRequest(`/users/${editingUserId}`, {
          method: 'PATCH',
          token,
          body: {
            user_name: form.user_name.trim(),
            user_email: form.user_email.trim(),
            user_phone: form.user_phone.trim(),
            role_name: form.role_name,
            status_name: form.status_name,
            ...(form.user_password.trim() ? { user_password: form.user_password.trim() } : {}),
          },
        });
        setMessage('User updated successfully.');
        successTitle = 'User updated';
        successMessage = 'The account details were saved successfully.';
      } else {
        await apiRequest('/users', {
          method: 'POST',
          token,
          body: {
            user_name: form.user_name.trim(),
            user_email: form.user_email.trim(),
            user_phone: form.user_phone.trim(),
            user_password: form.user_password.trim(),
            role_name: form.role_name,
            status_name: form.status_name,
          },
        });
        setMessage('User created successfully.');
        successTitle = 'User created';
        successMessage = 'The new account is now available in the users list.';
      }

      closeFormModal();
      await loadUsers();
      showSuccess(successTitle, successMessage);
    } catch (submitError) {
      const nextError = getErrorMessage(submitError, 'Unable to save user.');
      setError(nextError);
      setFieldErrors(getFieldErrors<keyof UserFieldErrors>(submitError));
      showError('Unable to save user', nextError);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(user: UsersPayload['users'][number]) {
    setEditingUserId(user.userId);
    setMessage(null);
    setError(null);
    setFieldErrors({});
    setForm({
      user_name: user.userName,
      user_email: user.userEmail,
      user_phone: user.userPhone || '',
      user_password: '',
      confirm_user_password: '',
      role_name: user.roleName,
      status_name: user.statusName,
    });
    setIsFormModalVisible(true);
  }

  function closeFormModal() {
    setEditingUserId(null);
    setForm(initialForm);
    setError(null);
    setFieldErrors({});
    setIsFormModalVisible(false);
  }

  function openCreateModal() {
    setMessage(null);
    setError(null);
    setFieldErrors({});
    setEditingUserId(null);
    setForm(initialForm);
    setIsFormModalVisible(true);
  }

  return (
    <RequireRole roles={['admin']}>
      <ScreenShell
        subtitle="Create and update admins or tenants with hashed passwords and role enforcement."
        title="User Management">
        <SectionCard>
          <Text style={styles.sectionTitle}>User actions</Text>
          <Text style={styles.helperText}>
            Open the form only when you need to create or edit a user account.
          </Text>
          {error && !isFormModalVisible ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          <Button label="Create user" onPress={openCreateModal} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Registered users</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : payload?.users.length ? (
            payload.users.map((user) => (
              <View key={user.userId} style={styles.listItem}>
                <Text style={styles.itemTitle}>{user.userName}</Text>
                <Text style={styles.helperText}>
                  {user.userEmail} · {user.roleName} · {user.statusName}
                </Text>
                <Text style={styles.helperText}>
                  Assigned rooms: {user.assignedRooms.length ? user.assignedRooms.join(', ') : 'None'}
                </Text>
                <Button label="Edit user" onPress={() => startEdit(user)} variant="ghost" />
              </View>
            ))
          ) : (
            <EmptyState
              description="Create your first tenant or admin account to continue the setup."
              title="No users yet"
            />
          )}
        </SectionCard>

        <FormModal
          onClose={closeFormModal}
          subtitle="Fill in the account details, role, and password only when you need to create or edit a user."
          title={editingUserId ? 'Update existing user' : 'Create new user'}
          visible={isFormModalVisible}>
          <Field
            autoComplete="off"
            error={fieldErrors.user_name}
            importantForAutofill="no"
            label="Full name"
            onChangeText={(value) => setForm((current) => ({ ...current, user_name: value }))}
            placeholder="Juan Dela Cruz"
            textContentType="none"
            value={form.user_name}
          />
          <Field
            autoCapitalize="none"
            autoComplete="off"
            error={fieldErrors.user_email}
            importantForAutofill="no"
            keyboardType="email-address"
            label="Email"
            onChangeText={(value) => setForm((current) => ({ ...current, user_email: value }))}
            placeholder="user@nilm.local"
            textContentType="none"
            value={form.user_email}
          />
          <Field
            autoComplete="off"
            error={fieldErrors.user_phone}
            importantForAutofill="no"
            keyboardType="phone-pad"
            label="Phone"
            onChangeText={(value) => setForm((current) => ({ ...current, user_phone: value }))}
            placeholder="09170000000"
            textContentType="none"
            value={form.user_phone}
          />
          <Field
            autoComplete="new-password"
            error={fieldErrors.user_password}
            importantForAutofill="no"
            label={editingUserId ? 'New password (optional)' : 'Password'}
            onChangeText={(value) => setForm((current) => ({ ...current, user_password: value }))}
            placeholder={editingUserId ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
            secureTextEntry
            textContentType="newPassword"
            value={form.user_password}
          />
          <Field
            autoComplete="new-password"
            error={fieldErrors.confirm_user_password}
            importantForAutofill="no"
            label={editingUserId ? 'Confirm new password' : 'Confirm password'}
            onChangeText={(value) =>
              setForm((current) => ({ ...current, confirm_user_password: value }))
            }
            placeholder={editingUserId ? 'Re-enter new password' : 'Re-enter password'}
            secureTextEntry
            textContentType="newPassword"
            value={form.confirm_user_password}
          />
          <Text style={styles.label}>Role</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, role_name: value }))}
            options={(payload?.roles || ['admin', 'tenant']).map((role) => ({
              label: role || '',
              value: role || 'tenant',
            }))}
            selectedValue={form.role_name}
          />
          {fieldErrors.role_name ? <Text style={styles.errorText}>{fieldErrors.role_name}</Text> : null}
          <Text style={styles.label}>Status</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, status_name: value }))}
            options={(payload?.statuses || ['active', 'inactive']).map((status) => ({
              label: status || '',
              value: status || 'active',
            }))}
            selectedValue={form.status_name}
          />
          {fieldErrors.status_name ? <Text style={styles.errorText}>{fieldErrors.status_name}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              label={editingUserId ? 'Update user' : 'Create user'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
            <Button label="Cancel" onPress={closeFormModal} variant="ghost" />
          </View>
        </FormModal>
      </ScreenShell>
    </RequireRole>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  buttonRow: {
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
  listItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: 14,
    gap: 6,
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
});

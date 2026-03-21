import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { useAuth } from '@/src/context/AuthContext';
import { UsersPayload } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
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

export default function UsersScreen() {
  const { token, logout } = useAuth();
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);

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
      setError('Name and email are required.');
      return;
    }

    if (!editingUserId && form.user_password.trim().length < 8) {
      setError('A password with at least 8 characters is required for new users.');
      return;
    }

    if (!editingUserId && form.user_password !== form.confirm_user_password) {
      setError('Password and confirm password must match.');
      return;
    }

    if (editingUserId && form.user_password.trim() && form.user_password !== form.confirm_user_password) {
      setError('New password and confirm password must match.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

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
      }

      setEditingUserId(null);
      setForm(initialForm);
      await loadUsers();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save user.'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(user: UsersPayload['users'][number]) {
    setEditingUserId(user.userId);
    setMessage(null);
    setError(null);
    setForm({
      user_name: user.userName,
      user_email: user.userEmail,
      user_phone: user.userPhone || '',
      user_password: '',
      confirm_user_password: '',
      role_name: user.roleName,
      status_name: user.statusName,
    });
  }

  function resetForm() {
    setEditingUserId(null);
    setForm(initialForm);
    setError(null);
    setMessage(null);
  }

  return (
    <RequireRole roles={['admin']}>
      <ScreenShell
        subtitle="Create and update admins or tenants with hashed passwords and role enforcement."
        title="User Management">
        <SectionCard>
          <Text style={styles.sectionTitle}>
            {editingUserId ? 'Update existing user' : 'Create new user'}
          </Text>
          <Field
            autoComplete="off"
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
          <Text style={styles.label}>Status</Text>
          <OptionChips
            onSelect={(value) => setForm((current) => ({ ...current, status_name: value }))}
            options={(payload?.statuses || ['active', 'inactive']).map((status) => ({
              label: status || '',
              value: status || 'active',
            }))}
            selectedValue={form.status_name}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              label={editingUserId ? 'Update user' : 'Create user'}
              loading={saving}
              onPress={() => void handleSubmit()}
            />
            {editingUserId ? (
              <Button label="Cancel edit" onPress={resetForm} variant="ghost" />
            ) : null}
          </View>
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

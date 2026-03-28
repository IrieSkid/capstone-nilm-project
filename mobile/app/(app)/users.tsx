import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { FormModal } from '@/src/components/FormModal';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SelectField } from '@/src/components/SelectField';
import { SectionCard } from '@/src/components/SectionCard';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { UsersPayload } from '@/src/types/models';
import { getErrorMessage, getFieldErrors, isUnauthorized } from '@/src/utils/errors';
import { formatDisplayLabel, formatStatusLabel } from '@/src/utils/format';
import { getPhilippinePhoneMessage, isValidPhilippinePhone, normalizePhilippinePhone } from '@/src/utils/phone';
import { theme } from '@/src/utils/theme';

const initialForm = {
  user_name: '',
  user_email: '',
  user_phone: '',
  user_password: '',
  confirm_user_password: '',
  user_landlord_id: null as number | null,
  role_name: 'tenant',
  status_name: 'active',
};

type UserFieldErrors = Partial<
  Record<
    | 'user_name'
    | 'user_email'
    | 'user_phone'
    | 'user_password'
    | 'confirm_user_password'
    | 'user_landlord_id'
    | 'role_name'
    | 'status_name',
    string
  >
>;

export default function UsersScreen() {
  const { showError, showSuccess } = useAppAlert();
  const { token, logout } = useAuth();
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');

  const loadUsers = useCallback(async (options?: { pullToRefresh?: boolean }) => {
    if (!token) {
      return;
    }

    try {
      if (options?.pullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
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
      setRefreshing(false);
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

    if (form.user_phone.trim() && !isValidPhilippinePhone(form.user_phone)) {
      const nextError = getPhilippinePhoneMessage();
      setError(nextError);
      setFieldErrors({ user_phone: nextError });
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

    if (form.role_name === 'tenant' && form.user_landlord_id === null) {
      const nextError = 'Select a landlord owner for tenant accounts.';
      setError(nextError);
      setFieldErrors({ user_landlord_id: nextError });
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
            user_phone: form.user_phone.trim() ? normalizePhilippinePhone(form.user_phone) : '',
            user_landlord_id: form.role_name === 'tenant' ? form.user_landlord_id : null,
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
            user_phone: form.user_phone.trim() ? normalizePhilippinePhone(form.user_phone) : '',
            user_password: form.user_password.trim(),
            user_landlord_id: form.role_name === 'tenant' ? form.user_landlord_id : null,
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
      user_landlord_id: user.landlordOwnerId,
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

  const landlordOptions = [
    { label: 'Select landlord owner', value: 'unassigned' as const },
    ...(payload?.users
      .filter((user) => user.roleName === 'landlord')
      .map((user) => ({
        label: user.userName,
        value: user.userId,
      })) ?? []),
  ];

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (payload?.users ?? []).filter((user) => {
      const matchesSearch =
        !normalizedSearch
        || [
          user.userName,
          user.userEmail,
          user.userPhone || '',
          user.landlordOwnerName || '',
          user.assignedRooms.join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesRole = roleFilter === 'all' || user.roleName === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.statusName === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [payload?.users, roleFilter, searchTerm, statusFilter]);

  const summaryItems = useMemo(() => {
    const users = payload?.users ?? [];

    return [
      { label: 'Total users', value: String(users.length) },
      {
        label: 'Active',
        value: String(users.filter((user) => user.statusName === 'active').length),
      },
      {
        label: 'Tenants',
        value: String(users.filter((user) => user.roleName === 'tenant').length),
      },
      {
        label: 'Pending',
        value: String(users.filter((user) => user.statusName === 'pending_approval').length),
      },
    ];
  }, [payload?.users]);

  return (
    <RequireRole roles={['admin']} permissionKey="users.view">
      <ScreenShell
        onRefresh={() => void loadUsers({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Create and update admins or tenants with hashed passwords and role enforcement."
        title="User Management">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Start here for a quick count of user accounts before opening the full list.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <Text style={styles.helperText}>
            Use this when you need to add a new account before reviewing or filtering the current list.
          </Text>
          <View style={styles.actionRow}>
            <Button label="Create user" onPress={openCreateModal} />
          </View>
          {error && !isFormModalVisible ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Find and manage</Text>
          <Text style={styles.helperText}>
            Search by name, email, phone, landlord owner, or assigned room to narrow the list before editing.
          </Text>
          <Field
            autoCapitalize="words"
            label="Search users"
            onChangeText={setSearchTerm}
            placeholder="Search name, email, landlord owner, or room"
            value={searchTerm}
          />
          <View style={styles.filterRow}>
            <View style={styles.filterItem}>
              <SelectField
                label="Role filter"
                options={[
                  { label: 'All roles', value: 'all' as const },
                  ...((payload?.roles || ['admin', 'tenant']).map((role) => ({
                    label: formatDisplayLabel(role || ''),
                    value: role || 'tenant',
                  }))),
                ]}
                selectedValue={roleFilter}
                onSelect={(value) => setRoleFilter(value)}
              />
            </View>
            <View style={styles.filterItem}>
              <SelectField
                label="Status filter"
                options={[
                  { label: 'All statuses', value: 'all' as const },
                  ...((payload?.statuses || ['active', 'inactive', 'suspended', 'pending_approval', 'rejected']).map((status) => ({
                    label: formatStatusLabel(status || ''),
                    value: status || 'active',
                  }))),
                ]}
                selectedValue={statusFilter}
                onSelect={(value) => setStatusFilter(value)}
              />
            </View>
          </View>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Registered users</Text>
          {!loading ? (
            <Text style={styles.helperText}>
              Showing {filteredUsers.length} of {payload?.users.length ?? 0} users.
            </Text>
          ) : null}
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : filteredUsers.length ? (
            filteredUsers.map((user, index) => (
              <View
                key={user.userId}
                style={[styles.listCard, index === 0 ? styles.listCardFirst : null]}>
                <View style={styles.listHeader}>
                  <Text style={styles.itemTitle}>{user.userName}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{formatDisplayLabel(user.roleName)}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeMuted]}>
                      <Text style={styles.badgeText}>{formatStatusLabel(user.statusName)}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.helperText}>{user.userEmail}</Text>
                <Text style={styles.helperText}>{user.userPhone || 'No phone number saved'}</Text>
                {user.roleName === 'landlord' ? (
                  <Text style={styles.helperText}>
                    Invite code: {user.landlordRegistrationCode ?? 'No invite code assigned yet'}
                  </Text>
                ) : null}
                {user.roleName === 'tenant' ? (
                  <Text style={styles.helperText}>
                    Landlord owner: {user.landlordOwnerName ?? 'Unassigned'}
                  </Text>
                ) : null}
                <Text style={styles.helperText}>
                  Assigned rooms: {user.assignedRooms.length ? user.assignedRooms.join(', ') : 'None'}
                </Text>
                <View style={styles.actionRow}>
                  <Button label="Edit user" onPress={() => startEdit(user)} variant="ghost" />
                </View>
              </View>
            ))
          ) : (
            <EmptyState
              description={
                payload?.users.length
                  ? 'Try a different search or filter to find the account you need.'
                  : 'Create your first tenant, landlord, or admin account to continue the setup.'
              }
              title={payload?.users.length ? 'No matching users' : 'No users yet'}
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
          <SelectField
            error={fieldErrors.role_name}
            label="Role"
            options={(payload?.roles || ['admin', 'tenant']).map((role) => ({
              label: formatDisplayLabel(role || ''),
              value: role || 'tenant',
            }))}
            selectedValue={form.role_name}
            onSelect={(value) =>
              setForm((current) => ({
                ...current,
                role_name: value,
                user_landlord_id: value === 'tenant' ? current.user_landlord_id : null,
              }))
            }
          />
          {form.role_name === 'tenant' ? (
            <>
              <SelectField
                error={fieldErrors.user_landlord_id}
                label="Landlord owner"
                options={landlordOptions}
                selectedValue={form.user_landlord_id ?? 'unassigned'}
                onSelect={(value) =>
                  setForm((current) => ({
                    ...current,
                    user_landlord_id: value === 'unassigned' ? null : Number(value),
                  }))
                }
              />
            </>
          ) : null}
          <SelectField
            error={fieldErrors.status_name}
            label="Status"
            options={(payload?.statuses || ['active', 'inactive', 'suspended', 'pending_approval', 'rejected']).map((status) => ({
              label: formatStatusLabel(status || ''),
              value: status || 'active',
            }))}
            selectedValue={form.status_name}
            onSelect={(value) => setForm((current) => ({ ...current, status_name: value }))}
          />
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterItem: {
    flex: 1,
    minWidth: 160,
  },
  listCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  listCardFirst: {
    borderWidth: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(79,163,181,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeMuted: {
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surface,
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    paddingTop: 4,
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

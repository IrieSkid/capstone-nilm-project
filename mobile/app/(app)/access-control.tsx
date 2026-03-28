import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { Field } from '@/src/components/Field';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { SelectField } from '@/src/components/SelectField';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import {
  AppModuleKey,
  RbacAuditLog,
  RoleAccessMatrix,
  RoleAccessMatrixItem,
  RoleName,
  UserAccessMatrixItem,
  UserOverrideState,
} from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatDateTime, formatDisplayLabel, formatStatusLabel } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

type AccessScope = 'roles' | 'users';

const editableRoleOrder: RoleName[] = ['tenant', 'landlord'];

const roleDescriptions: Record<RoleName, string> = {
  admin: 'Admin access is fixed with full control over all modules.',
  tenant: 'Change the default access that applies to all tenant accounts.',
  landlord: 'Change the default access that applies to all landlord accounts.',
};

const overrideStateLabels: Record<UserOverrideState, string> = {
  inherit: 'Inherit',
  allow: 'Allow',
  deny: 'Deny',
};

export default function AccessControlScreen() {
  const { token, logout } = useAuth();
  const { showError, showSuccess } = useAppAlert();
  const [matrix, setMatrix] = useState<RoleAccessMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<AccessScope>('roles');
  const [selectedRoleName, setSelectedRoleName] = useState<RoleName>('tenant');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [permissionSearchTerm, setPermissionSearchTerm] = useState('');
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const loadMatrix = useCallback(async (options?: { pullToRefresh?: boolean }) => {
    if (!token) {
      return;
    }

    try {
      if (options?.pullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const nextMatrix = await apiRequest<RoleAccessMatrix>('/rbac', { token });
      setMatrix(nextMatrix);
      setError(null);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load access control settings.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, token]);

  useFocusEffect(
    useCallback(() => {
      void loadMatrix();
    }, [loadMatrix]),
  );

  const editableRoles = useMemo(
    () =>
      (matrix?.roles ?? [])
        .filter((role) => role.isEditable)
        .sort(
          (left, right) =>
            editableRoleOrder.indexOf(left.roleName) - editableRoleOrder.indexOf(right.roleName),
        ),
    [matrix],
  );

  const editableUsers = useMemo(
    () =>
      (matrix?.users ?? [])
        .filter((user) => user.isEditable)
        .sort((left, right) => left.userName.localeCompare(right.userName)),
    [matrix],
  );

  useEffect(() => {
    if (!editableRoles.some((role) => role.roleName === selectedRoleName)) {
      setSelectedRoleName(editableRoles[0]?.roleName ?? 'tenant');
    }
  }, [editableRoles, selectedRoleName]);

  useEffect(() => {
    if (!editableUsers.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(editableUsers[0]?.userId ?? null);
    }
  }, [editableUsers, selectedUserId]);

  const selectedRole = useMemo<RoleAccessMatrixItem | null>(
    () => editableRoles.find((role) => role.roleName === selectedRoleName) ?? null,
    [editableRoles, selectedRoleName],
  );

  const selectedUser = useMemo<UserAccessMatrixItem | null>(
    () => editableUsers.find((user) => user.userId === selectedUserId) ?? null,
    [editableUsers, selectedUserId],
  );

  const normalizedPermissionSearch = permissionSearchTerm.trim().toLowerCase();

  const filteredRoleModules = useMemo(
    () =>
      (selectedRole?.modules ?? []).filter((module) =>
        !normalizedPermissionSearch
        || [
          module.moduleName,
          module.moduleKey,
          module.moduleDescription ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedPermissionSearch),
      ),
    [normalizedPermissionSearch, selectedRole?.modules],
  );

  const filteredUserModules = useMemo(
    () =>
      (selectedUser?.modules ?? []).filter((module) =>
        !normalizedPermissionSearch
        || [
          module.moduleName,
          module.moduleKey,
          module.moduleDescription ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedPermissionSearch),
      ),
    [normalizedPermissionSearch, selectedUser?.modules],
  );

  const totalModuleCount = useMemo(() => {
    const keys = new Set<AppModuleKey>();

    for (const role of matrix?.roles ?? []) {
      for (const module of role.modules) {
        keys.add(module.moduleKey);
      }
    }

    return keys.size;
  }, [matrix?.roles]);

  const summaryItems = useMemo(
    () => [
      { label: 'Editable roles', value: String(editableRoles.length) },
      { label: 'Editable users', value: String(editableUsers.length) },
      { label: 'Permission modules', value: String(totalModuleCount) },
      { label: 'Audit entries', value: String(matrix?.auditLogs.length ?? 0) },
    ],
    [editableRoles.length, editableUsers.length, matrix?.auditLogs.length, totalModuleCount],
  );

  const recentAuditLogs = useMemo(() => {
    const logs = matrix?.auditLogs ?? [];

    if (selectedScope === 'roles' && selectedRole) {
      return logs
        .filter((log) => log.targetScope === 'role' && log.targetRoleName === selectedRole.roleName)
        .slice(0, 8);
    }

    if (selectedScope === 'users' && selectedUser) {
      return logs
        .filter((log) => log.targetScope === 'user' && log.targetUserId === selectedUser.userId)
        .slice(0, 8);
    }

    return logs.slice(0, 8);
  }, [matrix?.auditLogs, selectedRole, selectedScope, selectedUser]);

  async function handleRoleToggle(moduleKey: AppModuleKey, nextCanAccess: boolean) {
    if (!token || !selectedRole) {
      return;
    }

    try {
      setUpdatingKey(`role:${selectedRole.roleId}:${moduleKey}`);
      const targetModule = selectedRole.modules.find((module) => module.moduleKey === moduleKey);

      const nextMatrix = await apiRequest<RoleAccessMatrix>(
        `/rbac/roles/${selectedRole.roleId}/modules/${moduleKey}`,
        {
          method: 'PATCH',
          token,
          body: { can_access: nextCanAccess },
        },
      );

      setMatrix(nextMatrix);
      showSuccess(
        'Role access updated',
        `${formatDisplayLabel(selectedRole.roleName)} default access for ${targetModule?.moduleName ?? moduleKey} is now ${nextCanAccess ? 'enabled' : 'disabled'}.`,
      );
    } catch (toggleError) {
      const nextError = getErrorMessage(toggleError, 'Unable to update role access.');
      showError('Access update failed', nextError);
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handleUserOverride(moduleKey: AppModuleKey, overrideState: UserOverrideState) {
    if (!token || !selectedUser) {
      return;
    }

    try {
      setUpdatingKey(`user:${selectedUser.userId}:${moduleKey}`);
      const targetModule = selectedUser.modules.find((module) => module.moduleKey === moduleKey);

      const nextMatrix = await apiRequest<RoleAccessMatrix>(
        `/rbac/users/${selectedUser.userId}/modules/${moduleKey}`,
        {
          method: 'PATCH',
          token,
          body: { override_state: overrideState },
        },
      );

      setMatrix(nextMatrix);
      showSuccess(
        'User override updated',
        `${selectedUser.userName} now uses ${overrideStateLabels[overrideState].toLowerCase()} for ${targetModule?.moduleName ?? moduleKey}.`,
      );
    } catch (overrideError) {
      const nextError = getErrorMessage(overrideError, 'Unable to update user override.');
      showError('Override update failed', nextError);
    } finally {
      setUpdatingKey(null);
    }
  }

  return (
    <RequireRole roles={['admin']} permissionKey="rbac.manage">
      <ScreenShell
        onRefresh={() => void loadMatrix({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle="Set role defaults first, then use user overrides only when someone needs an exception."
        title="Access Control">
        <SectionCard>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.helperText}>
            Admin access stays locked to prevent accidental lockout. Start here for a quick view of the access model before opening a scope.
          </Text>
          <SummaryGrid items={summaryItems} />
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Control workspace</Text>
          <Text style={styles.helperText}>
            Choose whether you are editing role defaults or a single-user exception, then search the permission list before making changes.
          </Text>
          <SelectField
            label="Access scope"
            options={[
              { label: 'Role defaults', value: 'roles' as const },
              { label: 'User overrides', value: 'users' as const },
            ]}
            selectedValue={selectedScope}
            onSelect={(value) => setSelectedScope(value)}
          />
          {selectedScope === 'roles' ? (
            <SelectField
              label="Role"
              options={editableRoles.map((role) => ({
                label: formatDisplayLabel(role.roleName),
                value: role.roleName,
              }))}
              selectedValue={selectedRoleName}
              onSelect={(value) => setSelectedRoleName(value as RoleName)}
            />
          ) : (
            <SelectField
              label="User"
              options={editableUsers.map((user) => ({
                label: `${user.userName} (${formatDisplayLabel(user.roleName)})`,
                value: user.userId,
              }))}
              selectedValue={selectedUserId}
              onSelect={(value) => setSelectedUserId(Number(value))}
            />
          )}
          <Field
            autoCapitalize="words"
            label="Search permissions"
            onChangeText={setPermissionSearchTerm}
            placeholder="Search module name or key"
            value={permissionSearchTerm}
          />
          {selectedScope === 'roles' && selectedRole ? (
            <Text style={styles.helperText}>{roleDescriptions[selectedRole.roleName]}</Text>
          ) : null}
          {selectedScope === 'users' && selectedUser ? (
            <Text style={styles.helperText}>
              {selectedUser.userEmail} - {formatDisplayLabel(selectedUser.roleName)} - {formatStatusLabel(selectedUser.statusName)}
            </Text>
          ) : null}
        </SectionCard>

        {loading && !matrix ? (
          <SectionCard>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.helperText}>Loading access control settings...</Text>
          </SectionCard>
        ) : null}

        {error ? (
          <SectionCard>
            <Text style={styles.errorTitle}>Access control error</Text>
            <Text style={styles.helperText}>{error}</Text>
            <Button label="Retry access control" onPress={() => void loadMatrix()} />
          </SectionCard>
        ) : null}

        {!loading && !error && selectedScope === 'roles' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>
              {selectedRole ? `${formatDisplayLabel(selectedRole.roleName)} default permissions` : 'Role permissions'}
            </Text>
            <Text style={styles.helperText}>
              Showing {filteredRoleModules.length} of {selectedRole?.modules.length ?? 0} modules.
            </Text>
            {selectedRole && filteredRoleModules.length ? (
              filteredRoleModules.map((module) => {
                const updateKey = `role:${selectedRole.roleId}:${module.moduleKey}`;

                return (
                  <View
                    key={module.moduleKey}
                    style={[
                      styles.listCard,
                      module.canAccess ? styles.roleCardEnabled : styles.roleCardDisabled,
                    ]}>
                    <View style={styles.listHeader}>
                      <Text style={styles.itemTitle}>{module.moduleName}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          module.canAccess ? styles.statusEnabled : styles.statusDisabled,
                        ]}>
                        <Text style={styles.statusBadgeText}>
                          {module.canAccess ? 'Enabled' : 'Disabled'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.helperText}>
                      {module.moduleDescription || 'No module description provided.'}
                    </Text>
                    <Text style={styles.helperText}>Key: {module.moduleKey}</Text>
                    <View style={styles.switchRow}>
                      <View style={styles.switchCopy}>
                        <Text style={styles.switchLabel}>Default access</Text>
                        <Text style={styles.helperText}>
                          {module.canAccess
                            ? 'This role can open the module by default.'
                            : 'This role cannot open the module by default.'}
                        </Text>
                      </View>
                      <View style={styles.switchControl}>
                        {updatingKey === updateKey ? (
                          <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : null}
                        <Switch
                          disabled={updatingKey === updateKey}
                          ios_backgroundColor={theme.colors.overlayStrong}
                          onValueChange={(value) => void handleRoleToggle(module.moduleKey, value)}
                          thumbColor={module.canAccess ? theme.colors.white : theme.colors.textMuted}
                          trackColor={{
                            false: 'rgba(224,93,93,0.35)',
                            true: 'rgba(63,191,127,0.55)',
                          }}
                          value={module.canAccess}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyState
                description={
                  selectedRole
                    ? 'Try a different permission search to find the module you need.'
                    : 'No editable role is currently selected.'
                }
                title={selectedRole ? 'No matching modules' : 'No role selected'}
              />
            )}
          </SectionCard>
        ) : null}

        {!loading && !error && selectedScope === 'users' ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>
              {selectedUser ? `${selectedUser.userName} overrides` : 'User overrides'}
            </Text>
            <Text style={styles.helperText}>
              Showing {filteredUserModules.length} of {selectedUser?.modules.length ?? 0} modules.
            </Text>
            {selectedUser && filteredUserModules.length ? (
              filteredUserModules.map((module) => {
                const updateKey = `user:${selectedUser.userId}:${module.moduleKey}`;

                return (
                  <View
                    key={module.moduleKey}
                    style={[
                      styles.listCard,
                      module.overrideState === 'allow'
                        ? styles.overrideCardAllow
                        : module.overrideState === 'deny'
                          ? styles.overrideCardDeny
                          : styles.overrideCardInherit,
                    ]}>
                    <View style={styles.listHeader}>
                      <Text style={styles.itemTitle}>{module.moduleName}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          module.effectiveCanAccess ? styles.statusEnabled : styles.statusDisabled,
                        ]}>
                        <Text style={styles.statusBadgeText}>
                          {module.effectiveCanAccess ? 'Effective on' : 'Effective off'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.helperText}>
                      Role default: {module.roleCanAccess ? 'Enabled' : 'Disabled'} - Override: {overrideStateLabels[module.overrideState]}
                    </Text>
                    <Text style={styles.helperText}>
                      {module.moduleDescription || 'No module description provided.'}
                    </Text>
                    <OptionChips
                      onSelect={(value) => void handleUserOverride(module.moduleKey, value)}
                      options={[
                        { label: 'Inherit', value: 'inherit' as const },
                        { label: 'Allow', value: 'allow' as const },
                        { label: 'Deny', value: 'deny' as const },
                      ]}
                      selectedValue={module.overrideState}
                    />
                    {updatingKey === updateKey ? (
                      <Text style={styles.helperText}>Saving override...</Text>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <EmptyState
                description={
                  selectedUser
                    ? 'Try a different permission search to find the module you need.'
                    : 'No editable user is currently selected.'
                }
                title={selectedUser ? 'No matching modules' : 'No user selected'}
              />
            )}
          </SectionCard>
        ) : null}

        {!loading && !error ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Recent audit trail</Text>
            <Text style={styles.helperText}>
              Showing {recentAuditLogs.length} of {matrix?.auditLogs.length ?? 0} audit entries{selectedScope === 'roles' && selectedRole ? ` for ${formatDisplayLabel(selectedRole.roleName)}` : ''}{selectedScope === 'users' && selectedUser ? ` for ${selectedUser.userName}` : ''}.
            </Text>
            {recentAuditLogs.length ? (
              recentAuditLogs.map((log) => <AuditLogItem key={log.auditLogId} log={log} />)
            ) : (
              <EmptyState
                description="Permission changes will appear here once an admin updates a role default or user override."
                title="No recent audit entries"
              />
            )}
          </SectionCard>
        ) : null}
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
  helperText: {
    color: theme.colors.textMuted,
    lineHeight: 21,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 18,
    fontWeight: '800',
  },
  listCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.overlayStrong,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 14,
    gap: 10,
  },
  roleCardEnabled: {
    backgroundColor: 'rgba(63,191,127,0.12)',
    borderColor: 'rgba(63,191,127,0.35)',
  },
  roleCardDisabled: {
    backgroundColor: 'rgba(224,93,93,0.10)',
    borderColor: 'rgba(224,93,93,0.28)',
  },
  overrideCardInherit: {
    backgroundColor: 'rgba(79,163,181,0.12)',
    borderColor: 'rgba(79,163,181,0.30)',
  },
  overrideCardAllow: {
    backgroundColor: 'rgba(63,191,127,0.12)',
    borderColor: 'rgba(63,191,127,0.35)',
  },
  overrideCardDeny: {
    backgroundColor: 'rgba(224,93,93,0.10)',
    borderColor: 'rgba(224,93,93,0.28)',
  },
  listHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusEnabled: {
    backgroundColor: 'rgba(63,191,127,0.14)',
    borderColor: theme.colors.success,
  },
  statusDisabled: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.overlayStrong,
  },
  statusBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  switchControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});

function AuditLogItem({ log }: { log: RbacAuditLog }) {
  const targetLabel =
    log.targetScope === 'role'
      ? `Role: ${formatDisplayLabel(log.targetRoleName ?? 'Unknown role')}`
      : `User: ${log.targetUserName ?? 'Unknown user'}${log.targetUserEmail ? ` (${log.targetUserEmail})` : ''}`;

  return (
    <View style={styles.listCard}>
      <View style={styles.listHeader}>
        <Text style={styles.itemTitle}>{log.moduleName}</Text>
        <View style={[styles.statusBadge, styles.statusDisabled]}>
          <Text style={styles.statusBadgeText}>{formatDisplayLabel(log.targetScope)}</Text>
        </View>
      </View>
      <Text style={styles.helperText}>{targetLabel}</Text>
      <Text style={styles.helperText}>
        {log.changedByName} changed {log.previousState} to {log.nextState}
      </Text>
      <Text style={styles.helperText}>{formatDateTime(log.createdAt)}</Text>
    </View>
  );
}

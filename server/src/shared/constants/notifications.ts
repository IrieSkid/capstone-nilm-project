import { RoleName } from '../types/auth';

export type NotificationPreferenceKey =
  | 'billing_statement_issued'
  | 'billing_due_soon'
  | 'billing_overdue'
  | 'billing_payment_submitted'
  | 'billing_payment_approved'
  | 'billing_payment_rejected'
  | 'tenant_request_submitted'
  | 'device_offline'
  | 'threshold_alert'
  | 'overload_alert';

export interface NotificationPreferenceDefinition {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
  category: 'billing' | 'monitoring' | 'requests';
  roles: RoleName[];
  defaultEnabled: boolean;
}

export const DEFAULT_WARNING_POWER_W = 1200;
export const DEFAULT_OVERLOAD_POWER_W = 1800;

export const NOTIFICATION_PREFERENCE_DEFINITIONS: NotificationPreferenceDefinition[] = [
  {
    key: 'billing_statement_issued',
    label: 'Bill issued',
    description: 'Notify me when a new official billing statement is issued.',
    category: 'billing',
    roles: ['tenant'],
    defaultEnabled: true,
  },
  {
    key: 'billing_due_soon',
    label: 'Bill due soon',
    description: 'Notify me when an issued bill is close to its due date.',
    category: 'billing',
    roles: ['tenant'],
    defaultEnabled: true,
  },
  {
    key: 'billing_overdue',
    label: 'Bill overdue',
    description: 'Notify me when an issued bill becomes overdue.',
    category: 'billing',
    roles: ['tenant'],
    defaultEnabled: true,
  },
  {
    key: 'billing_payment_submitted',
    label: 'Payment submitted',
    description: 'Notify me when a tenant submits a payment for verification.',
    category: 'billing',
    roles: ['landlord'],
    defaultEnabled: true,
  },
  {
    key: 'billing_payment_approved',
    label: 'Payment approved',
    description: 'Notify me when a submitted payment is approved.',
    category: 'billing',
    roles: ['tenant'],
    defaultEnabled: true,
  },
  {
    key: 'billing_payment_rejected',
    label: 'Payment rejected',
    description: 'Notify me when a submitted payment is rejected.',
    category: 'billing',
    roles: ['tenant'],
    defaultEnabled: true,
  },
  {
    key: 'tenant_request_submitted',
    label: 'Tenant request submitted',
    description: 'Notify me when a new tenant registration request needs attention.',
    category: 'requests',
    roles: ['landlord', 'admin'],
    defaultEnabled: true,
  },
  {
    key: 'device_offline',
    label: 'Device offline',
    description: 'Notify me when a monitoring device stops checking in.',
    category: 'monitoring',
    roles: ['admin', 'landlord', 'tenant'],
    defaultEnabled: true,
  },
  {
    key: 'threshold_alert',
    label: 'Usage threshold alert',
    description: 'Notify me when room power usage crosses the warning threshold.',
    category: 'monitoring',
    roles: ['admin', 'landlord', 'tenant'],
    defaultEnabled: true,
  },
  {
    key: 'overload_alert',
    label: 'Overload alert',
    description: 'Notify me when room power usage crosses the critical overload threshold.',
    category: 'monitoring',
    roles: ['admin', 'landlord', 'tenant'],
    defaultEnabled: true,
  },
];

export function getNotificationPreferenceDefinition(key: string) {
  return NOTIFICATION_PREFERENCE_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}

export function getNotificationPreferenceDefinitionsForRole(roleName: RoleName) {
  return NOTIFICATION_PREFERENCE_DEFINITIONS.filter((definition) =>
    definition.roles.includes(roleName),
  );
}

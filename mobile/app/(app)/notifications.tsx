import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '@/src/api/client';
import { Button } from '@/src/components/Button';
import { EmptyState } from '@/src/components/EmptyState';
import { FormModal } from '@/src/components/FormModal';
import { OptionChips } from '@/src/components/OptionChips';
import { RequireRole } from '@/src/components/RequireRole';
import { ScreenShell } from '@/src/components/ScreenShell';
import { SectionCard } from '@/src/components/SectionCard';
import { SummaryGrid } from '@/src/components/SummaryGrid';
import { useAppAlert } from '@/src/context/AlertContext';
import { useAuth } from '@/src/context/AuthContext';
import { useNotificationSummary } from '@/src/context/NotificationSummaryContext';
import { NotificationRecord, NotificationsData } from '@/src/types/models';
import { getErrorMessage, isUnauthorized } from '@/src/utils/errors';
import { formatCurrency, formatDate, formatDateTime, formatDisplayLabel } from '@/src/utils/format';
import { theme } from '@/src/utils/theme';

type NotificationFilter = 'all' | 'unread' | 'read' | 'action_needed';

function getNotificationTone(notification: NotificationRecord) {
  if (notification.severity === 'critical') {
    return styles.dangerCard;
  }

  if (notification.severity === 'warning' || !notification.isRead) {
    return styles.warningCard;
  }

  return styles.infoCard;
}

function getOpenLabel(actionPath: string | null) {
  if (!actionPath) {
    return null;
  }

  if (actionPath.includes('billing')) {
    return 'Open billing';
  }

  if (actionPath.includes('landlord-room-detail')) {
    return 'Open room';
  }

  if (actionPath.includes('dashboard')) {
    return 'Open dashboard';
  }

  return 'Open related screen';
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { token, logout, user } = useAuth();
  const { refreshSummary } = useNotificationSummary();
  const { showError, showSuccess } = useAppAlert();
  const [data, setData] = useState<NotificationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [markingNotificationId, setMarkingNotificationId] = useState<number | null>(null);

  const subtitle = useMemo(() => {
    if (user?.roleName === 'admin') {
      return 'System alerts, billing events, and future platform notifications all land here.';
    }

    if (user?.roleName === 'landlord') {
      return 'Tenant requests, billing events, and future property alerts all stay in one shared inbox.';
    }

    return 'Billing updates, room alerts, and future device notifications all land in one inbox.';
  }, [user?.roleName]);

  const loadData = useCallback(async (options?: { pullToRefresh?: boolean }) => {
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
      setData(await apiRequest<NotificationsData>('/notifications', { token }));
      void refreshSummary();
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }

      setError(getErrorMessage(loadError, 'Unable to load notifications.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, token]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const filteredNotifications = useMemo(() => {
    const notifications = data?.notifications ?? [];

    return notifications.filter((notification) => {
      if (filter === 'unread') return !notification.isRead;
      if (filter === 'read') return notification.isRead;
      if (filter === 'action_needed') {
        return !notification.isRead || notification.severity !== 'info';
      }
      return true;
    });
  }, [data?.notifications, filter]);

  const summaryItems = useMemo(
    () => [
      { label: 'Total notifications', value: String(data?.summary.totalNotifications ?? 0) },
      { label: 'Unread', value: String(data?.summary.unreadNotifications ?? 0) },
      { label: 'Action needed', value: String(data?.summary.actionNeededNotifications ?? 0) },
      { label: 'Critical', value: String(data?.summary.criticalNotifications ?? 0) },
    ],
    [
      data?.summary.actionNeededNotifications,
      data?.summary.criticalNotifications,
      data?.summary.totalNotifications,
      data?.summary.unreadNotifications,
    ],
  );

  async function handleMarkAsRead(notificationId: number) {
    if (!token) {
      return;
    }

    try {
      setMarkingNotificationId(notificationId);
      await apiRequest(`/notifications/${notificationId}/read`, { method: 'PATCH', token });
      setData((current) => {
        if (!current) return current;

        const notifications = current.notifications.map((notification) =>
          notification.notificationId === notificationId
            ? { ...notification, isRead: true, readAt: new Date().toISOString() }
            : notification,
        );

        return {
          ...current,
          summary: {
            totalNotifications: notifications.length,
            unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
            actionNeededNotifications: notifications.filter(
              (notification) => !notification.isRead || notification.severity !== 'info',
            ).length,
            criticalNotifications: notifications.filter(
              (notification) => notification.severity === 'critical',
            ).length,
          },
          notifications,
        };
      });
      setSelectedNotification(null);
      await refreshSummary();
      showSuccess('Notification updated', 'This notification is now marked as read.');
    } catch (markError) {
      showError('Unable to update notification', getErrorMessage(markError, 'Unable to update this notification.'));
    } finally {
      setMarkingNotificationId(null);
    }
  }

  function handleOpenRelatedScreen(path: string | null) {
    if (!path) {
      return;
    }

    router.push(path as never);
  }

  return (
    <RequireRole roles={['admin', 'landlord', 'tenant']}>
      <ScreenShell
        onRefresh={() => void loadData({ pullToRefresh: true })}
        refreshing={refreshing}
        subtitle={subtitle}
        title="Notifications">
        <SectionCard>
          <Text style={styles.sectionTitle}>Notification center</Text>
          <Text style={styles.helperText}>Tap a notification to read the full message, open the related screen, or mark it as read.</Text>
          <SummaryGrid items={summaryItems} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </SectionCard>

        <OptionChips
          onSelect={(value) => setFilter(value)}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Unread', value: 'unread' },
            { label: 'Read', value: 'read' },
            { label: 'Action needed', value: 'action_needed' },
          ]}
          selectedValue={filter}
        />

        <SectionCard>
          <Text style={styles.sectionTitle}>Inbox</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : filteredNotifications.length === 0 ? (
            <EmptyState
              title="No notifications"
              description="Alerts from billing, devices, safety thresholds, and future system events will appear here."
            />
          ) : (
            filteredNotifications.map((notification) => (
              <Pressable
                key={notification.notificationId}
                android_ripple={{ color: 'rgba(79,163,181,0.08)' }}
                onPress={() => setSelectedNotification(notification)}
                style={({ hovered, pressed }) => [
                  styles.cardShell,
                  getNotificationTone(notification),
                  (hovered || pressed) ? styles.cardPressableActive : null,
                ]}>
                <View style={styles.cardPressable}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.itemTitle}>{notification.title}</Text>
                    <Text style={styles.badgeText}>{notification.isRead ? 'Read' : 'Unread'}</Text>
                  </View>
                  <Text style={styles.helperText}>{notification.message}</Text>
                  <Text style={styles.helperText}>
                    {formatDisplayLabel(notification.category)} {notification.severity !== 'info'
                      ? `- ${formatDisplayLabel(notification.severity)}`
                      : ''}
                  </Text>
                  {notification.statementRoomName ? (
                    <Text style={styles.helperText}>Room: {notification.statementRoomName}</Text>
                  ) : null}
                  <Text style={styles.helperText}>Received {formatDateTime(notification.createdAt)}</Text>
                  <View style={styles.tapHintRow}>
                    <Text style={styles.tapHintText}>Tap to open details</Text>
                    <Text style={styles.tapHintArrow}>{'>'}</Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </SectionCard>

        <FormModal
          onClose={() => setSelectedNotification(null)}
          subtitle="Important alerts stay detailed here so the inbox can stay compact and easy to scan."
          title={selectedNotification?.title ?? 'Notification details'}
          visible={selectedNotification !== null}>
          {selectedNotification ? (
            <>
              <Text style={styles.helperText}>{selectedNotification.message}</Text>
              <Text style={styles.helperText}>
                Category: {formatDisplayLabel(selectedNotification.category)}
              </Text>
              <Text style={styles.helperText}>
                Severity: {formatDisplayLabel(selectedNotification.severity)}
              </Text>
              {selectedNotification.statementRoomName ? (
                <Text style={styles.helperText}>Room: {selectedNotification.statementRoomName}</Text>
              ) : null}
              {selectedNotification.statementNumber ? (
                <Text style={styles.helperText}>Statement: {selectedNotification.statementNumber}</Text>
              ) : null}
              {selectedNotification.statementTotalAmount !== null ? (
                <Text style={styles.helperText}>Amount: {formatCurrency(selectedNotification.statementTotalAmount)}</Text>
              ) : null}
              {selectedNotification.statementDueDate ? (
                <Text style={styles.helperText}>Due date: {formatDate(selectedNotification.statementDueDate)}</Text>
              ) : null}
              <Text style={styles.helperText}>Received: {formatDateTime(selectedNotification.createdAt)}</Text>
              <View style={styles.footerButtons}>
                {!selectedNotification.isRead ? (
                  <Button
                    label="Mark as read"
                    loading={markingNotificationId === selectedNotification.notificationId}
                    onPress={() => void handleMarkAsRead(selectedNotification.notificationId)}
                    variant="secondary"
                  />
                ) : null}
                {selectedNotification.actionPath ? (
                  <Button
                    label={getOpenLabel(selectedNotification.actionPath) ?? 'Open related screen'}
                    onPress={() => handleOpenRelatedScreen(selectedNotification.actionPath)}
                    variant="ghost"
                  />
                ) : null}
              </View>
            </>
          ) : null}
        </FormModal>
      </ScreenShell>
    </RequireRole>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  helperText: { color: theme.colors.textMuted, lineHeight: 20 },
  errorText: { color: theme.colors.danger, fontWeight: '600' },
  cardShell: { borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.overlayStrong, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' },
  cardPressable: { gap: 8, padding: 14 },
  cardPressableActive: { backgroundColor: 'rgba(79,163,181,0.05)' },
  infoCard: { borderColor: theme.colors.primary, backgroundColor: 'rgba(79,163,181,0.08)' },
  warningCard: { borderColor: '#c99a1a', backgroundColor: 'rgba(201,154,26,0.12)' },
  dangerCard: { borderColor: theme.colors.danger, backgroundColor: 'rgba(224,93,93,0.12)' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemTitle: { color: theme.colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
  badgeText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  tapHintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(79,163,181,0.18)', marginTop: 2, paddingTop: 10 },
  tapHintText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
  tapHintArrow: { color: theme.colors.primary, fontSize: 16, fontWeight: '800' },
  footerButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

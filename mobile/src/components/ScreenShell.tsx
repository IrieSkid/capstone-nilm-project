import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { ReactNode, RefObject } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useNotificationSummary } from '../context/NotificationSummaryContext';
import { hasModuleAccess } from '../utils/access';
import { blurActiveElement, runAfterBlur } from '../utils/focus';
import { formatDisplayLabel } from '../utils/format';
import { AppPath, getDefaultAppPath, getMenuForUser } from '../utils/navigation';
import { theme } from '../utils/theme';

export function ScreenShell({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing = false,
  contentScrollRef,
  onContentScroll,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentScrollRef?: RefObject<ScrollView | null>;
  onContentScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const { user } = useAuth();
  const { summary } = useNotificationSummary();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) {
    return null;
  }

  const menuItems = getMenuForUser(user);
  const defaultAppPath = getDefaultAppPath(user);
  const canOpenProfile = user.roleName === 'admin' || hasModuleAccess(user, 'profile.manage');
  const notificationPath = '/notifications';
  const canOpenNotifications = true;
  const notificationCount = summary.unreadNotifications;
  const notificationActive = Boolean(
    pathname === notificationPath || pathname === `/(app)${notificationPath}`,
  );

  function isMenuItemActive(path: AppPath) {
    const normalizedPath = path.replace('/(app)', '');

    if (pathname === normalizedPath || pathname === path) {
      return true;
    }

    if (
      normalizedPath === '/landlord-rooms'
      && (
        pathname.startsWith('/landlord-room-detail')
        || pathname.startsWith('/(app)/landlord-room-detail')
      )
    ) {
      return true;
    }

    return false;
  }

  function navigateTo(path: AppPath) {
    if (pathname === path) {
      blurActiveElement();
      return;
    }

    runAfterBlur(() => {
      if (Platform.OS === 'web') {
        router.replace(path);
        return;
      }

      router.navigate(path);
    });
  }

  function navigateToNotificationInbox() {
    if (!notificationPath) {
      return;
    }

    if (pathname === notificationPath || pathname === `/(app)${notificationPath}`) {
      blurActiveElement();
      return;
    }

    runAfterBlur(() => {
      if (Platform.OS === 'web') {
        router.replace(notificationPath as never);
        return;
      }

      router.navigate(notificationPath as never);
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={[...theme.gradients.hero]} style={styles.hero}>
        <Text style={styles.eyebrow}>AppliSense</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.heroActions}>
          <Pressable
            style={[
              styles.heroActionBase,
              styles.profilePill,
              !canOpenProfile ? styles.profilePillDisabled : null,
            ]}
            disabled={!canOpenProfile}
            onPress={() => navigateTo(canOpenProfile ? '/(app)/profile' : defaultAppPath)}>
            <Text style={styles.profileName}>{user.userName}</Text>
            <Text style={styles.profileRole}>{formatDisplayLabel(user.roleName)}</Text>
          </Pressable>
          {canOpenNotifications ? (
            <Pressable
              hitSlop={8}
              style={[
                styles.notificationPill,
                notificationActive ? styles.notificationPillActive : null,
                notificationCount > 0 ? styles.notificationPillAttention : null,
              ]}
              onPress={navigateToNotificationInbox}>
              <View style={styles.notificationIconWrap}>
                <MaterialIcons
                  color={notificationCount > 0 ? '#FFECEC' : theme.colors.white}
                  name="notifications-active"
                  size={24}
                />
                {notificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeLabel}>
                      {notificationCount > 99 ? '99+' : String(notificationCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.menuWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.menuContainer}
          style={styles.menuScroll}>
          {menuItems.map((item) => {
            const active = isMenuItemActive(item.path);

            return (
              <Pressable
                key={item.path}
                onPress={() => navigateTo(item.path)}
                style={[styles.menuPill, active ? styles.menuPillActive : null]}>
                <Text style={[styles.menuLabel, active ? styles.menuLabelActive : null]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={onContentScroll}
        ref={contentScrollRef}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              colors={[theme.colors.primary]}
              onRefresh={onRefresh}
              progressBackgroundColor={theme.colors.surface}
              refreshing={refreshing}
              tintColor={theme.colors.primary}
            />
          ) : undefined
        }
        scrollEventThrottle={16}
        style={styles.contentScroll}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 22,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    gap: 8,
  },
  eyebrow: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.white,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.white,
    lineHeight: 20,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  heroActionBase: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    overflow: 'hidden',
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
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      },
    }),
  },
  profilePill: {
    flex: 1,
    minWidth: 132,
    borderColor: Platform.OS === 'android' ? theme.colors.line : 'rgba(255,255,255,0.10)',
    backgroundColor: Platform.OS === 'android' ? theme.colors.surface : 'rgba(14, 26, 31, 0.42)',
    paddingVertical: 9,
  },
  notificationPill: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  notificationPillAttention: {
    opacity: 1,
  },
  notificationPillActive: {
    opacity: 0.88,
  },
  notificationIconWrap: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.danger,
    borderWidth: 1.5,
    borderColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeLabel: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  profilePillDisabled: {
    opacity: 0.64,
  },
  profileName: {
    color: theme.colors.white,
    fontWeight: '800',
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  profileRole: {
    color: '#8EDFD4',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.4,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
  menuWrapper: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  menuScroll: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 60,
  },
  menuContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 10,
    alignItems: 'center',
  },
  menuPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 42,
    justifyContent: 'center',
  },
  menuPillActive: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primary,
  },
  menuLabel: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  menuLabelActive: {
    color: theme.colors.white,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 4,
    gap: 16,
  },
});

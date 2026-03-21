import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../context/AuthContext';
import { blurActiveElement, runAfterBlur } from '../utils/focus';
import { getMenuForRole } from '../utils/navigation';
import { theme } from '../utils/theme';

export function ScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) {
    return null;
  }

  const menuItems = getMenuForRole(user.roleName);

  function navigateTo(
    path:
      | '/(app)/dashboard'
      | '/(app)/users'
      | '/(app)/rooms'
      | '/(app)/devices'
      | '/(app)/profile',
  ) {
    if (pathname === path) {
      blurActiveElement();
      return;
    }

    runAfterBlur(() => {
      router.replace(path);
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={[...theme.gradients.hero]} style={styles.hero}>
        <Text style={styles.eyebrow}>NILM CAPSTONE MVP</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Pressable style={styles.profilePill} onPress={() => navigateTo('/(app)/profile')}>
          <Text style={styles.profileName}>{user.userName}</Text>
          <Text style={styles.profileRole}>{user.roleName.toUpperCase()}</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.menuWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.menuContainer}
          style={styles.menuScroll}>
          {menuItems.map((item) => {
            const active = pathname === item.path;

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

      <ScrollView contentContainerStyle={styles.content} style={styles.contentScroll}>
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
  profilePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: theme.colors.overlayStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  profileName: {
    color: theme.colors.white,
    fontWeight: '700',
  },
  profileRole: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
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

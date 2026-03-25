import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { blurActiveElement } from '../utils/focus';
import { theme } from '../utils/theme';

type AlertTone = 'success' | 'error' | 'info';

interface AlertOptions {
  tone?: AlertTone;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

interface AlertState extends AlertOptions {
  tone: AlertTone;
}

interface AlertContextValue {
  showAlert: (options: AlertOptions) => void;
  showSuccess: (title: string, message: string, onConfirm?: () => void) => void;
  showError: (title: string, message: string, onConfirm?: () => void) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState | null>(null);

  useEffect(() => {
    if (alert) {
      blurActiveElement();
    }
  }, [alert]);

  function hideAlert() {
    const onConfirm = alert?.onConfirm;
    setAlert(null);
    onConfirm?.();
  }

  function showAlert(options: AlertOptions) {
    setAlert({
      tone: options.tone ?? 'info',
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      onConfirm: options.onConfirm,
    });
  }

  const value = useMemo<AlertContextValue>(() => ({
    showAlert,
    showSuccess(title, message, onConfirm) {
      showAlert({
        tone: 'success',
        title,
        message,
        confirmLabel: 'OK',
        onConfirm,
      });
    },
    showError(title, message, onConfirm) {
      showAlert({
        tone: 'error',
        title,
        message,
        confirmLabel: 'Close',
        onConfirm,
      });
    },
    hideAlert,
  }), [alert]);

  const palette = alert
    ? {
        success: {
          badgeBackground: 'rgba(63,191,127,0.16)',
          badgeBorder: 'rgba(63,191,127,0.36)',
          badgeText: theme.colors.success,
          buttonVariant: 'primary' as const,
        },
        error: {
          badgeBackground: 'rgba(224,93,93,0.16)',
          badgeBorder: 'rgba(224,93,93,0.36)',
          badgeText: theme.colors.danger,
          buttonVariant: 'danger' as const,
        },
        info: {
          badgeBackground: 'rgba(79,163,181,0.16)',
          badgeBorder: 'rgba(79,163,181,0.36)',
          badgeText: theme.colors.primary,
          buttonVariant: 'secondary' as const,
        },
      }[alert.tone]
    : null;

  return (
    <AlertContext.Provider value={value}>
      {children}
      {alert && palette ? (
        <Modal
          animationType="fade"
          onRequestClose={hideAlert}
          presentationStyle="overFullScreen"
          statusBarTranslucent
          transparent>
          <View style={styles.overlay}>
            <View style={styles.card}>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: palette.badgeBackground,
                    borderColor: palette.badgeBorder,
                  },
                ]}>
                <Text style={[styles.badgeText, { color: palette.badgeText }]}>
                  {alert.tone.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title}>{alert.title}</Text>
              <Text style={styles.message}>{alert.message}</Text>
              <Button
                label={alert.confirmLabel || 'OK'}
                onPress={hideAlert}
                variant={palette.buttonVariant}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </AlertContext.Provider>
  );
}

export function useAppAlert() {
  const context = useContext(AlertContext);

  if (!context) {
    throw new Error('useAppAlert must be used within AlertProvider.');
  }

  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(3, 11, 14, 0.78)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    padding: 22,
    gap: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  badge: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: theme.colors.textMuted,
    lineHeight: 22,
    textAlign: 'center',
  },
});

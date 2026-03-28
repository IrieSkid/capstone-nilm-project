import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { apiRequest } from '../api/client';
import { NotificationSummaryData } from '../types/models';
import { isUnauthorized } from '../utils/errors';
import { useAuth } from './AuthContext';

const NOTIFICATION_SUMMARY_REFRESH_MS = 5000;

interface NotificationSummaryContextValue {
  summary: NotificationSummaryData;
  refreshSummary: () => Promise<void>;
}

const EMPTY_SUMMARY: NotificationSummaryData = {
  totalNotifications: 0,
  unreadNotifications: 0,
  actionNeededNotifications: 0,
  criticalNotifications: 0,
};

const NotificationSummaryContext = createContext<NotificationSummaryContextValue | undefined>(undefined);

export function NotificationSummaryProvider({ children }: { children: ReactNode }) {
  const { token, user, logout } = useAuth();
  const [summary, setSummary] = useState<NotificationSummaryData>(EMPTY_SUMMARY);
  const requestInFlightRef = useRef(false);

  const refreshSummary = useCallback(async () => {
    if (!token || !user || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;

    try {
      const nextSummary = await apiRequest<NotificationSummaryData>('/notifications/summary', {
        token,
      });
      setSummary(nextSummary);
    } catch (loadError) {
      if (isUnauthorized(loadError)) {
        await logout();
        return;
      }
    } finally {
      requestInFlightRef.current = false;
    }
  }, [logout, token, user]);

  useEffect(() => {
    if (!token || !user) {
      setSummary(EMPTY_SUMMARY);
      return;
    }

    void refreshSummary();

    const intervalId = setInterval(() => {
      void refreshSummary();
    }, NOTIFICATION_SUMMARY_REFRESH_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshSummary, token, user]);

  const value = useMemo(
    () => ({
      summary,
      refreshSummary,
    }),
    [refreshSummary, summary],
  );

  return (
    <NotificationSummaryContext.Provider value={value}>
      {children}
    </NotificationSummaryContext.Provider>
  );
}

export function useNotificationSummary() {
  const context = useContext(NotificationSummaryContext);

  if (!context) {
    throw new Error('useNotificationSummary must be used within NotificationSummaryProvider.');
  }

  return context;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiRequest } from '../api/client';
import { LoginPayload, User } from '../types/models';
import { blurActiveElement } from '../utils/focus';

const STORAGE_KEY = 'nilm_capstone_auth';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const authRequestVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const requestVersion = authRequestVersionRef.current + 1;
      authRequestVersionRef.current = requestVersion;

      try {
        const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

        if (!storedValue) {
          if (cancelled || requestVersion !== authRequestVersionRef.current) {
            return;
          }

          setLoading(false);
          return;
        }

        const parsed = JSON.parse(storedValue) as { token: string };
        setToken(parsed.token);

        const me = await apiRequest<User>('/auth/me', {
          token: parsed.token,
        });

        if (cancelled || requestVersion !== authRequestVersionRef.current) {
          return;
        }

        setUser(me);
      } catch {
        if (cancelled || requestVersion !== authRequestVersionRef.current) {
          return;
        }

        await AsyncStorage.removeItem(STORAGE_KEY);
        setUser(null);
        setToken(null);
      } finally {
        if (!cancelled && requestVersion === authRequestVersionRef.current) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const requestVersion = authRequestVersionRef.current + 1;
    authRequestVersionRef.current = requestVersion;

    const payload = await apiRequest<LoginPayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    if (requestVersion !== authRequestVersionRef.current) {
      return payload.user;
    }

    setUser(payload.user);
    setToken(payload.token);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: payload.token }));
    return payload.user;
  }, []);

  const logout = useCallback(async () => {
    blurActiveElement();
    authRequestVersionRef.current += 1;
    setUser(null);
    setToken(null);
    setLoading(false);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) {
      return;
    }

    const requestVersion = authRequestVersionRef.current;
    const me = await apiRequest<User>('/auth/me', {
      token,
    });

    if (requestVersion !== authRequestVersionRef.current) {
      return;
    }

    setUser(me);
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refreshUser,
    }),
    [loading, login, logout, refreshUser, token, user],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}

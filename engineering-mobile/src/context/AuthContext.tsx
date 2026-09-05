import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { apiRequest } from '@/api/client';
import { LoginPayload, User } from '@/types/models';

const STORAGE_KEY = 'nilm_engineering_monitor_auth';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as { token: string };
        const currentUser = await apiRequest<User>('/auth/me', { token: parsed.token });
        if (active) {
          setToken(parsed.token);
          setUser(currentUser);
        }
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        if (active) setLoading(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<LoginPayload>('/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password },
    });
    setToken(result.token);
    setUser(result.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: result.token }));
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ user, token, loading, login, logout }), [user, token, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}

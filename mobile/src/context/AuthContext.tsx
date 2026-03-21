import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { apiRequest } from '../api/client';
import { LoginPayload, User } from '../types/models';
import { blurActiveElement } from '../utils/focus';

const STORAGE_KEY = 'nilm_capstone_auth';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

        if (!storedValue) {
          setLoading(false);
          return;
        }

        const parsed = JSON.parse(storedValue) as { token: string };
        setToken(parsed.token);

        const me = await apiRequest<User>('/auth/me', {
          token: parsed.token,
        });

        setUser(me);
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  async function login(email: string, password: string) {
    const payload = await apiRequest<LoginPayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    setUser(payload.user);
    setToken(payload.token);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: payload.token }));
  }

  async function logout() {
    blurActiveElement();
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  async function refreshUser() {
    if (!token) {
      return;
    }

    const me = await apiRequest<User>('/auth/me', {
      token,
    });

    setUser(me);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        refreshUser,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}

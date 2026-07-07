'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUserDto } from '@ticketing/shared';

const STORAGE_KEY = 'rangmanch.auth';

interface AuthContextValue {
  user: AuthUserDto | null;
  token: string | null;
  ready: boolean;
  setSession: (token: string, refreshToken: string, user: AuthUserDto) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { token: string; user: AuthUserDto };
        setToken(parsed.token);
        setUser(parsed.user);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  const setSession = useCallback(
    (accessToken: string, refreshToken: string, u: AuthUserDto) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: accessToken, refreshToken, user: u }),
      );
      setToken(accessToken);
      setUser(u);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, ready, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

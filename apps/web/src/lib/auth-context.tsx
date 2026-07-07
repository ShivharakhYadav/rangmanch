'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AuthUserDto } from '@ticketing/shared';
import { refreshTokens } from './api';

const STORAGE_KEY = 'rangmanch.auth';

interface AuthContextValue {
  user: AuthUserDto | null;
  token: string | null;
  ready: boolean;
  setSession: (token: string, refreshToken: string, user: AuthUserDto) => void;
  logout: () => void;
  /** Authenticated fetch: injects the access token, silently refreshes on 401,
   *  and redirects to /login if the session can't be recovered. */
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Refs mirror state so authedFetch always reads the latest tokens.
  const tokenRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  tokenRef.current = token;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          token: string;
          refreshToken: string;
          user: AuthUserDto;
        };
        setToken(parsed.token);
        refreshRef.current = parsed.refreshToken;
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
      tokenRef.current = accessToken;
      refreshRef.current = refreshToken;
      setToken(accessToken);
      setUser(u);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    tokenRef.current = null;
    refreshRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const withAuth = (tok: string | null): Promise<Response> =>
        fetch(url, {
          ...init,
          headers: {
            ...(init.headers ?? {}),
            ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
          },
        });

      let res = await withAuth(tokenRef.current);
      if (res.status !== 401) return res;

      // Access token likely expired — try a silent refresh, then retry once.
      if (refreshRef.current) {
        try {
          const refreshed = await refreshTokens(refreshRef.current);
          setSession(refreshed.accessToken, refreshed.refreshToken, refreshed.user);
          res = await withAuth(refreshed.accessToken);
          if (res.status !== 401) return res;
        } catch {
          /* refresh failed — fall through to logout */
        }
      }

      // Couldn't recover the session: clear it and send the user to login.
      logout();
      if (typeof window !== 'undefined') {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
      return res;
    },
    [setSession, logout],
  );

  return (
    <AuthContext.Provider value={{ user, token, ready, setSession, logout, authedFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

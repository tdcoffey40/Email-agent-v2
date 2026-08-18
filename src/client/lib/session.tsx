import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@shared/types';
import { type AppConfig, api } from './api';

interface SessionValue {
  user: User | null;
  config: AppConfig | null;
  /** True until the first `/auth/me` and `/config` round trip settles. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [me, appConfig] = await Promise.all([
        api.me().catch(() => ({ user: null })),
        api.config().catch(() => null),
      ]);
      if (cancelled) return;
      setUser(me.user);
      setConfig(appConfig);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: signedIn } = await api.login(email, password);
    setUser(signedIn);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { user: created } = await api.register(email, password, name);
    setUser(created);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, config, loading, login, register, logout }),
    [user, config, loading, login, register, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider.');
  return context;
}

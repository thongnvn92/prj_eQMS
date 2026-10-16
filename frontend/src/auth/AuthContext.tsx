import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../services/api';
import type { Permission } from './permissions';
import type { SessionUser } from '../mock/types';

const SESSION_KEY = 'eqms.session';

interface AuthContextValue {
  user: SessionUser | null;
  token: string | null;
  loading: boolean; // đang khôi phục session
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);

  // Khôi phục session khi reload trang (FR-AUTH-02)
  useEffect(() => {
    let alive = true;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    api
      .me()
      .then((restored) => {
        if (!alive) return;
        if (restored) setUser(restored);
        else {
          localStorage.removeItem(SESSION_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Hết hạn / token bị thu hồi giữa phiên: services/api phát sự kiện này khi nhận 401.
  useEffect(() => {
    const onUnauthorized = () => {
      localStorage.removeItem(SESSION_KEY);
      setToken(null);
      setUser(null);
    };
    window.addEventListener('eqms:unauthorized', onUnauthorized);
    return () => window.removeEventListener('eqms:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password); // throws 401 nếu sai
    localStorage.setItem(SESSION_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => !!user && user.permissions.includes(permission),
    [user],
  );

  const canAny = useCallback(
    (permissions: Permission[]) => !!user && permissions.some((p) => user.permissions.includes(p)),
    [user],
  );

  const value = useMemo(
    () => ({ user, token, loading, login, logout, can, canAny }),
    [user, token, loading, login, logout, can, canAny],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng trong <AuthProvider>');
  return ctx;
}

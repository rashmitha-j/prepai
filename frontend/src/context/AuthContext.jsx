import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api';
import { clearToken, getToken, setToken } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'loading' while an existing token is being verified with the server
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'anonymous'));

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    authApi
      .me()
      .then(({ user: me }) => {
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          setStatus('anonymous');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setStatus('anonymous');
    };
    window.addEventListener('prepai:unauthorized', onUnauthorized);
    return () => window.removeEventListener('prepai:unauthorized', onUnauthorized);
  }, []);

  const acceptSession = useCallback(({ user: u, token }) => {
    setToken(token);
    setUser(u);
    setStatus('authenticated');
  }, []);

  const login = useCallback(async (email, password) => acceptSession(await authApi.login({ email, password })), [acceptSession]);
  const register = useCallback(async (body) => acceptSession(await authApi.register(body)), [acceptSession]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ user, status, isAuthenticated: status === 'authenticated', login, register, logout, setUser, acceptSession }),
    [user, status, login, register, logout, acceptSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

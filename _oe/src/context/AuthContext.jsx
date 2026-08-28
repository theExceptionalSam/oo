import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, SessionExpiredError } from '../api/client';

const AuthContext = createContext(null);

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrator',
  SCHOOL_OWNER: 'School Owner',
  ACCOUNTANT: 'Accountant',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

export function AuthProvider({ children, onExpired }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!api.tokens.access);

  useEffect(() => {
    if (!api.tokens.access) return;
    api.me()
      .then(setUser)
      .catch((e) => { if (e instanceof SessionExpiredError) onExpired?.(); })
      .finally(() => setBooting(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const u = await api.login(email, password);
    setUser(await api.me());
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = { user, booting, login, logout, isAdmin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

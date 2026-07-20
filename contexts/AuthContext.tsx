import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface AuthContextValue {
  userId: string | undefined;
  setUserId: (id: string | undefined) => void;
  handleLogout: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Provides authentication context (userId, logout) to the component tree. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { userId, setUserId, handleLogout } = useAuth();
  return <AuthContext.Provider value={{ userId, setUserId, handleLogout }}>{children}</AuthContext.Provider>;
}

/** Returns the auth context value. Must be used within an AuthProvider. */
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

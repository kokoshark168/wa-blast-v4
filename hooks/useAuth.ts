'use client';

import { useSession } from '@/lib/auth/session-provider';

export function useAuth() {
  const { user, token, isLoading, login, logout } = useSession();

  return {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    logout,
  };
}

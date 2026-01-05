'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { User } from '@/types';
import { getUserPermissions } from '@/utils/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  permissions: ReturnType<typeof getUserPermissions>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const u = data.session?.user || null;
      if (u) {
        setUser({
          id: u.id,
          email: u.email || '',
          name: u.user_metadata?.name || '',
          role: (u.user_metadata?.role as User['role']) || 'user',
          emailVerified: !!u.email_confirmed_at,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    };
    const { data: sub } = supabaseClient.auth.onAuthStateChange(() => init());
    init();
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    type SignOutOptions = NonNullable<Parameters<typeof supabaseClient.auth.signOut>[0]>;
    const { error } = await supabaseClient.auth.signOut({ scope: 'global' } satisfies SignOutOptions);
    if (typeof window !== 'undefined') {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
          .forEach((k) => localStorage.removeItem(k));
        // Also clear potential refresh keys
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') && k.includes('refresh'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
    if (error) throw error;
    setUser(null);
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...userData });
    }
  };

  const permissions = getUserPermissions(user);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    permissions,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

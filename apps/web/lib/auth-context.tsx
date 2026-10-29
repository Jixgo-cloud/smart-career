'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest } from './api';

export interface AuthUser {
  id: string;
  email: string;
  role: 'CANDIDATE' | 'COMPANY' | 'ADMIN';
  authProvider: string;
  avatarUrl: string | null;
  candidateProfile?: {
    id: string;
    fullName: string;
    headline?: string | null;
    targetCareer?: string | null;
    githubUsername?: string | null;
  } | null;
  company?: {
    id: string;
    name: string;
    slug: string;
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
    memberRole: string;
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<AuthUser | null>;
  loginAdmin: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => null,
  loginAdmin: async () => {
    throw new Error('Not initialized');
  },
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiRequest<AuthUser>('/auth/me');
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const loginAdmin = async (email: string, password: string) => {
    const res = await apiRequest<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, refreshUser, loginAdmin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

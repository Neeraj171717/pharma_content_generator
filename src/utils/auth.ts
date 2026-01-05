import { User } from '@/types';

export const isAuthenticated = (user: User | null): boolean => {
  return user !== null && user.emailVerified === true;
};

export const hasRole = (user: User | null, roles: string[]): boolean => {
  if (!user) return false;
  return roles.includes(user.role);
};

export const isAdmin = (user: User | null): boolean => {
  return hasRole(user, ['admin']);
};

export const isManager = (user: User | null): boolean => {
  return hasRole(user, ['admin', 'manager']);
};

export const canEditContent = (user: User | null, contentUserId: string): boolean => {
  if (!user) return false;
  return user.role === 'admin' || user.id === contentUserId;
};

export const canDeleteContent = (user: User | null, contentUserId: string): boolean => {
  if (!user) return false;
  return user.role === 'admin' || user.id === contentUserId;
};

export const canManageUsers = (user: User | null): boolean => {
  return hasRole(user, ['admin']);
};

export const canViewAnalytics = (user: User | null): boolean => {
  return hasRole(user, ['admin', 'manager']);
};

export const getUserPermissions = (user: User | null) => {
  if (!user) {
    return {
      canCreateContent: false,
      canEditContent: false,
      canDeleteContent: false,
      canManageUsers: false,
      canViewAnalytics: false,
      canAccessAdmin: false,
    };
  }

  return {
    canCreateContent: ['user', 'manager', 'admin'].includes(user.role),
    canEditContent: (contentUserId: string) => canEditContent(user, contentUserId),
    canDeleteContent: (contentUserId: string) => canDeleteContent(user, contentUserId),
    canManageUsers: canManageUsers(user),
    canViewAnalytics: canViewAnalytics(user),
    canAccessAdmin: ['admin', 'manager'].includes(user.role),
  };
};
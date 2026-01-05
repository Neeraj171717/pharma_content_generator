// User types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'guest' | 'user' | 'manager' | 'admin';
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Content types
export interface Content {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: 'article' | 'post' | 'page';
  status: 'draft' | 'published' | 'archived';
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface Media {
  id: string;
  contentId?: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: Date;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: Date;
}

// Activity types
export interface Activity {
  id: string;
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  ipAddress?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Authentication types
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: Omit<User, 'password'>;
  role: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  acceptTerms: boolean;
}

// Content management types
export interface CreateContentRequest {
  title: string;
  content: string;
  type: 'article' | 'post' | 'page';
  status: 'draft' | 'published';
  tags?: string[];
}

export interface UpdateContentRequest {
  title?: string;
  content?: string;
  type?: 'article' | 'post' | 'page';
  status?: 'draft' | 'published' | 'archived';
  tags?: string[];
}

export interface ContentListParams {
  page?: number;
  limit?: number;
  status?: 'all' | 'draft' | 'published' | 'archived';
  search?: string;
  userId?: string;
}

// User profile types
export interface UpdateProfileRequest {
  name?: string;
  bio?: string;
  avatar?: string;
}

// Admin types
export interface UserListParams {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
}

export interface UpdateUserRoleRequest {
  userId: string;
  role: 'guest' | 'user' | 'manager' | 'admin';
}

// Dashboard types
export interface DashboardStats {
  totalUsers: number;
  totalContent: number;
  recentActivity: Activity[];
  contentByType: Record<string, number>;
  userGrowth: Array<{ date: string; count: number }>;
}

// Form types
export interface FormError {
  field: string;
  message: string;
}

export interface ValidationResponse {
  success: boolean;
  errors?: FormError[];
}

// Theme types
export type Theme = 'light' | 'dark' | 'system';

// Navigation types
export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  items?: NavItem[];
  roles?: string[];
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

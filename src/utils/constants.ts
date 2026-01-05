// App configuration
export const APP_NAME = 'Pharma Content Generator';
export const APP_DESCRIPTION = 'A modern web application for content management and user interaction';
export const APP_VERSION = '1.0.0';

// API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
export const API_TIMEOUT = 30000; // 30 seconds

// Authentication configuration
export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
export const JWT_EXPIRES_IN = '7d';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Password requirements
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REQUIREMENTS = {
  minLength: PASSWORD_MIN_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

// Pagination configuration
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

// File upload configuration
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Content configuration
export const CONTENT_TYPES = ['article', 'post', 'page'] as const;
export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;
export const USER_ROLES = ['guest', 'user', 'manager', 'admin'] as const;

// Rate limiting
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 100;

// Security configuration
export const BCRYPT_ROUNDS = 12;
export const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Email configuration
export const EMAIL_VERIFICATION_EXPIRES_IN = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_EXPIRES_IN = 60 * 60 * 1000; // 1 hour

// Analytics configuration
export const ANALYTICS_TRACKING_ID = process.env.NEXT_PUBLIC_ANALYTICS_ID;

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_REGISTRATION: process.env.NEXT_PUBLIC_ENABLE_REGISTRATION === 'true',
  ENABLE_SOCIAL_LOGIN: process.env.NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN === 'true',
  ENABLE_EMAIL_VERIFICATION: process.env.NEXT_PUBLIC_ENABLE_EMAIL_VERIFICATION === 'true',
  ENABLE_TWO_FACTOR_AUTH: process.env.NEXT_PUBLIC_ENABLE_TWO_FACTOR_AUTH === 'true',
  ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
};

// Navigation items
export const NAVIGATION_ITEMS = [
  {
    title: 'Home',
    href: '/',
    roles: ['guest', 'user', 'manager', 'admin'],
  },
  {
    title: 'Dashboard',
    href: '/dashboard',
    roles: ['user', 'manager', 'admin'],
  },
  {
    title: 'Content',
    href: '/content',
    roles: ['user', 'manager', 'admin'],
  },
  {
    title: 'Documents',
    href: '/documents',
    roles: ['user', 'manager', 'admin'],
  },
  {
    title: 'Profile',
    href: '/profile',
    roles: ['user', 'manager', 'admin'],
  },
  {
    title: 'Admin',
    href: '/admin',
    roles: ['admin'],
  },
];

// Error messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'You are not authorized to perform this action',
  FORBIDDEN: 'You do not have permission to access this resource',
  NOT_FOUND: 'The requested resource was not found',
  INTERNAL_ERROR: 'An internal server error occurred',
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_LOCKED: 'Your account has been locked due to too many failed login attempts',
  EMAIL_NOT_VERIFIED: 'Please verify your email address before logging in',
  USER_ALREADY_EXISTS: 'A user with this email address already exists',
  INVALID_TOKEN: 'Invalid or expired token',
  PASSWORD_TOO_WEAK: 'Password does not meet security requirements',
  CONTENT_NOT_FOUND: 'Content not found or you do not have permission to access it',
  VALIDATION_ERROR: 'Please check your input and try again',
};

// Success messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'You have been successfully logged in',
  REGISTER_SUCCESS: 'Your account has been created successfully. Please check your email to verify your account',
  EMAIL_VERIFIED: 'Your email address has been successfully verified',
  PASSWORD_RESET: 'Password reset instructions have been sent to your email',
  PASSWORD_UPDATED: 'Your password has been successfully updated',
  PROFILE_UPDATED: 'Your profile has been successfully updated',
  CONTENT_CREATED: 'Content has been successfully created',
  CONTENT_UPDATED: 'Content has been successfully updated',
  CONTENT_DELETED: 'Content has been successfully deleted',
  USER_UPDATED: 'User has been successfully updated',
  USER_DELETED: 'User has been successfully deleted',
};
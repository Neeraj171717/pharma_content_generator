import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from './constants';

// Email validation schema
export const emailSchema = z
  .string()
  .email('Please enter a valid email address')
  .min(1, 'Email is required')
  .max(255, 'Email must be less than 255 characters')
  .transform((email) => email.toLowerCase().trim());

// Password validation schema
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
  .max(128, 'Password must be less than 128 characters')
  .refine(
    (password) => {
      if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
        return false;
      }
      if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
        return false;
      }
      if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
        return false;
      }
      if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return false;
      }
      return true;
    },
    {
      message: 'Password must contain uppercase, lowercase, number, and special character',
    }
  );

// Name validation schema
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters')
  .regex(/^[a-zA-Z\s\-\']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes')
  .transform((name) => name.trim());

// Login validation schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

// Registration validation schema
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    name: nameSchema,
    role: z.enum(['user', 'manager', 'admin']).default('user'),
    organization: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

// Content validation schema
export const contentSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters')
    .trim(),
  content: z
    .string()
    .min(1, 'Content is required')
    .max(10000, 'Content must be less than 10000 characters')
    .trim(),
  type: z.enum(['article', 'post', 'page']),
  status: z.enum(['draft', 'published']),
  tags: z.array(z.string()).optional(),
});

// Update content validation schema
export const updateContentSchema = contentSchema.partial();

// Profile validation schema
export const profileSchema = z.object({
  name: nameSchema.optional(),
  bio: z
    .string()
    .max(500, 'Bio must be less than 500 characters')
    .optional(),
  avatar: z
    .string()
    .url('Please enter a valid URL for your avatar')
    .optional(),
});

// Password reset validation schema
export const passwordResetSchema = z.object({
  email: emailSchema,
});

// Password update validation schema
export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Email verification validation schema
export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// User role update validation schema
export const userRoleUpdateSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: z.enum(['guest', 'user', 'manager', 'admin']),
});

// Content list query validation schema
export const contentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: z.enum(['all', 'draft', 'published', 'archived']).optional().default('all'),
  search: z.string().optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
});

// User list query validation schema
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  role: z.enum(['guest', 'user', 'manager', 'admin']).optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'all']).optional().default('all'),
});

// File upload validation schema
export const fileUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size must be less than 10MB',
    })
    .refine(
      (file) => [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.type),
      {
        message: 'Invalid file type',
      }
    ),
});

// Helper function to validate form data
export const validateFormData = <T>(schema: z.ZodSchema<T>, data: unknown): { success: boolean; data?: T; errors?: Array<{ field: string; message: string }> } => {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return { success: false, errors };
    }
    return { success: false, errors: [{ field: 'general', message: 'Validation failed' }] };
  }
};

// Helper function to validate email
export const isValidEmail = (email: string): boolean => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

// Helper function to validate password
export const isValidPassword = (password: string): boolean => {
  try {
    passwordSchema.parse(password);
    return true;
  } catch {
    return false;
  }
};

// Sanitize HTML content
export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};

// Validate file type
export const isValidFileType = (file: File): boolean => {
  const validTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  return validTypes.includes(file.type);
};

// Validate file size
export const isValidFileSize = (file: File, maxSizeInMB: number = 10): boolean => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return file.size <= maxSizeInBytes;
};

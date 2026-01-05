import { NextAuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { JWT_SECRET, JWT_EXPIRES_IN } from '@/utils/constants';

const buildAuthOptions = (): NextAuthOptions => ({
  adapter: PrismaAdapter(prisma) as unknown as Adapter,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user) {
          throw new Error('Invalid credentials');
        }

        if (!user.emailVerified) {
          throw new Error('Please verify your email before logging in');
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        if (!isPasswordValid) {
          throw new Error('Invalid credentials');
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await prisma.activity.create({
          data: {
            userId: user.id,
            type: 'LOGIN',
            description: 'User logged in',
            metadata: { provider: 'credentials' },
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    secret: JWT_SECRET,
    maxAge: parseInt(JWT_EXPIRES_IN.replace('d', '')) * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const role = (user as { role?: unknown }).role;
        if (typeof role === 'string') token.role = role;
        const emailVerified = (user as { emailVerified?: unknown }).emailVerified;
        if (typeof emailVerified === 'boolean') token.emailVerified = emailVerified;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.emailVerified = token.emailVerified as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    newUser: '/auth/register',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
  },
  secret: JWT_SECRET,
});

let cachedAuthOptions: NextAuthOptions | null = null;

const getAuthOptions = (): NextAuthOptions => {
  cachedAuthOptions ??= buildAuthOptions();
  return cachedAuthOptions;
};

export const authOptions: NextAuthOptions = new Proxy({} as NextAuthOptions, {
  get(_target, property) {
    const options = getAuthOptions();
    const value = (options as unknown as Record<PropertyKey, unknown>)[property];
    if (typeof value === 'function') {
      return (...args: unknown[]) =>
        (value as (...args: unknown[]) => unknown).apply(options, args);
    }
    return value;
  },
});

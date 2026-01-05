import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getPrisma = (): PrismaClient => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize PrismaClient');
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log: ['query'],
  });

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;

  return client;
};

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = (client as unknown as Record<PropertyKey, unknown>)[property];
    if (typeof value === 'function') {
      return (...args: unknown[]) =>
        (value as (...args: unknown[]) => unknown).apply(client, args);
    }
    return value;
  },
});

import { PrismaClient } from '@prisma/client';

// Next dev-mode hot reload re-evaluates modules, so without a global cache each
// reload opens another connection pool against Supabase and eventually
// exhausts it.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

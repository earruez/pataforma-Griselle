import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient();

// Avoid re-creating in dev hot-reload
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Neon free-tier computes auto-suspend after ~5 min of inactivity.
 *  This keepalive fires every 4 minutes to keep the connection warm. */
let _keepaliveTimer: ReturnType<typeof setInterval> | null = null;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');

  // Start keepalive — prevents Neon auto-suspend during active sessions
  _keepaliveTimer = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.debug('DB keepalive ok');
    } catch (e) {
      logger.warn({ err: e }, 'DB keepalive failed — reconnecting');
      await prisma.$connect().catch(() => {});
    }
  }, 4 * 60 * 1000); // every 4 minutes
}

export async function disconnectDatabase(): Promise<void> {
  if (_keepaliveTimer) clearInterval(_keepaliveTimer);
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

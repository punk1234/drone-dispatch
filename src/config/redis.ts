import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error:', err));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}

export const CACHE_KEYS = {
  AVAILABLE_DRONES: 'drones:available',
  DRONE_BATTERY: (id: string) => `drone:${id}:battery`,
};

export const CACHE_TTL = parseInt(process.env.CACHE_TTL || '30', 10);

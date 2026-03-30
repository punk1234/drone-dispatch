import { getRedisClient } from '../config/redis';
import { logger } from './logger';

/**
 * @class CacheService
 *
 * Wraps Redis with a typed, failure-tolerant interface.
 * Services interact with this class — never with Redis or ioredis directly.
 * Swapping Redis for another cache provider only requires changes here.
 */
export class CacheService {
  /**
   * Retrieve a cached value and deserialise it.
   * Returns null on cache miss or Redis failure (fail-open).
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await getRedisClient().get(key);
      if (!value) return null;
      logger.debug(`[Cache] HIT — ${key}`);
      return JSON.parse(value) as T;
    } catch (err) {
      logger.warn(`[Cache] GET failed for key "${key}":`, err);
      return null;
    }
  }

  /**
   * Store a value with a TTL in seconds.
   * Failures are logged but never propagated — cache is non-critical.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await getRedisClient().setex(key, ttlSeconds, JSON.stringify(value));
      logger.debug(`[Cache] SET — ${key} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      logger.warn(`[Cache] SET failed for key "${key}":`, err);
    }
  }

  /**
   * Delete one or more cache keys.
   * Failures are logged but never propagated.
   */
  async del(...keys: string[]): Promise<void> {
    try {
      await getRedisClient().del(...keys);
      logger.debug(`[Cache] DEL — ${keys.join(', ')}`);
    } catch (err) {
      logger.warn(`[Cache] DEL failed for keys "${keys.join(', ')}":`, err);
    }
  }
}

export const cacheService = new CacheService();

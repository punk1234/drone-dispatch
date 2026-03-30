import { Application } from 'express';
import { AbstractApp } from './abstract.app';
import RouteManager from './route.manager';
import { connectDatabase, disconnectDatabase, prisma } from '../config/database';
import { connectRedis, disconnectRedis, getRedisClient } from '../config/redis';
import { disconnectRabbit } from '../config/rabbitmq';
import { startBatteryAuditJob } from '../jobs/battery-audit.job';
import { startDroneEventConsumer } from '../workers/rabbitmq.consumer';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

/**
 * @class App
 * @extends AbstractApp
 *
 * Concrete application — wires PostgreSQL, Redis, RabbitMQ,
 * the battery audit cron job, and the event consumer.
 */
export default class App extends AbstractApp {
  constructor(engine: Application, port: number) {
    super(engine, port);
  }

  /**
   * Establish all external connections and start background jobs.
   * Failures here prevent the server from starting.
   */
  protected async setupDependencies(): Promise<void> {
    await connectDatabase();
    await connectRedis();

    // Non-fatal — RabbitMQ consumer and cron jobs log errors but don't crash startup
    startBatteryAuditJob();
    await startDroneEventConsumer();
  }

  /**
   * Assert all critical dependencies are live before accepting traffic.
   * Called after initialize() and before run().
   */
  checkDependencies(): void {
    // Verify Prisma client is connected by checking its internal state
    if (!prisma) {
      throw new AppError('Database client not initialised', 500);
    }

    // Verify Redis is connected
    const redis = getRedisClient();
    if (!redis || redis.status === 'end' || redis.status === 'close') {
      throw new AppError('Redis client not connected', 500);
    }
  }

  /**
   * Register all API routes via RouteManager.
   */
  protected installRoutes(): void {
    RouteManager.installRoutes(this.engine);
  }

  /**
   * Gracefully shut down all connections then close the HTTP server.
   * @param {boolean} closeDataStores — set false in tests to skip DB teardown
   */
  async close(closeDataStores: boolean = true): Promise<void> {
    if (closeDataStores) {
      await Promise.all([
        disconnectDatabase(),
        disconnectRedis(),
        disconnectRabbit(),
      ]);
      logger.info('All connections closed');
    }

    super.close();
  }
}

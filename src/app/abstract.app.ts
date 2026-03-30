import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
import compression from 'compression';
import morgan from 'morgan';

/**
 * @abstract
 * @class AbstractApp
 *
 * Defines the application lifecycle:
 *   initialize() → setupDependencies() + configure()
 *   checkDependencies()
 *   run()
 *   close()
 */
export abstract class AbstractApp {
  readonly engine: Application;
  protected readonly port: number;
  readonly inProduction: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected connection: any;

  constructor(engine: Application, port: number) {
    this.engine = engine;
    this.port = port;
    this.inProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Connect databases, message brokers, caches, and background jobs.
   */
  protected abstract setupDependencies(): Promise<void>;

  /**
   * Register all API routes onto the Express engine.
   */
  protected abstract installRoutes(): void;

  /**
   * Assert all critical dependencies are healthy before accepting traffic.
   */
  abstract checkDependencies(): void;

  /**
   * Apply global middleware and install routes.
   * Called internally by initialize() after setupDependencies().
   */
  protected configure(): void {
    // Prevent caching of API responses
    this.engine.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });

    this.engine.set('trust proxy', true);
    this.engine.use(helmet());
    this.engine.use(cors());
    this.engine.use(compression());
    this.engine.use(express.json());
    this.engine.use(express.urlencoded({ extended: true }));

    if (!this.inProduction) {
      this.engine.use(
        morgan('combined', {
          stream: { write: (msg: string) => logger.info(msg.trim()) },
        })
      );
    }

    this.installRoutes();

    this.engine.use(notFoundHandler);
    this.engine.use(errorHandler);
  }

  /**
   * Set up dependencies and configure the Express engine.
   * Must be called before run().
   */
  async initialize(): Promise<void> {
    await this.setupDependencies();
    this.configure();
  }

  /**
   * Start the HTTP server and begin accepting connections.
   */
  run(): void {
    this.connection = this.engine.listen(this.port, () => {
      logger.info(`🚀 Drone Dispatch API running on http://localhost:${this.port}`);
      logger.info(`📚 Swagger docs at http://localhost:${this.port}/api/docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  }

  /**
   * Gracefully close the HTTP server.
   */
  close(): void {
    this.connection?.close();
  }
}

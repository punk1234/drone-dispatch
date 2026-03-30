import { Application, RequestHandler, Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger';
import { ApiResponseHandler } from '../utils/api-response.handler';

/**
 * @class RouteManager
 *
 * Centralises API route registration.
 * Called from App.installRoutes() during application configuration.
 */
export default class RouteManager {
  /**
   * @static
   * @param {Application} app — the Express engine instance
   */
  static installRoutes(app: Application): void {
    // Health check — unauthenticated, before route auth middleware
    app.get('/health', (_req, res) => {
      ApiResponseHandler.ok(res, { ok: true });
    });

    // Swagger docs — unauthenticated
    app.use(
      '/api/docs',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(swaggerUi.serve as any[]),
      swaggerUi.setup(swaggerSpec, { explorer: true }) as unknown as RequestHandler
    );
    app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

    const apiRouter = Router();

    app.use('/api', apiRouter);
  }
}

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponseHandler } from '../utils/api-response.handler';

export type ApiRole = 'admin' | 'readonly';

// Augment express-serve-static-core so req.apiRole is typed throughout the app
declare module 'express-serve-static-core' {
  interface Request {
    apiRole?: ApiRole;
  }
}

// Read lazily per-call so test environments can override process.env freely
function resolveRole(key: string): ApiRole | null {
  const adminKey = process.env.ADMIN_API_KEY || 'admin-secret-key-change-in-production';
  const readonlyKey = process.env.READONLY_API_KEY || 'readonly-secret-key-change-in-production';
  if (key === adminKey) return 'admin';
  if (key === readonlyKey) return 'readonly';
  return null;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string | undefined;

  if (!key) {
    ApiResponseHandler.send(res, 401, { message: 'Missing API key — provide X-Api-Key header' });
    return;
  }

  const role = resolveRole(key);

  if (!role) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    ApiResponseHandler.send(res, 401, { message: 'Invalid API key' });
    return;
  }

  req.apiRole = role;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.apiRole !== 'admin') {
    ApiResponseHandler.send(res, 403, { message: 'This action requires admin privileges' });
    return;
  }
  next();
}

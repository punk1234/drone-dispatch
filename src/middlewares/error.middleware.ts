import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
    });
    return;
  }

  // Multer file size error
  if (err.message?.includes('Only image files')) {
    res.status(400).json({ message: err.message });
    return;
  }

  logger.error('Unhandled error:', err);

  res.status(500).json({
    message: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { error: "Server error occured!" }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

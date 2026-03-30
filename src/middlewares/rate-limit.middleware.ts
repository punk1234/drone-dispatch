import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { ApiResponseHandler } from '../utils/api-response.handler';

// ── Config from environment ───────────────────────────────────────────────
// Defaults are production-appropriate values.
// For local testing set RATE_LIMIT_MAX_STRICT=1000 (or any large number)
// to effectively disable limiting without removing the middleware.

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
const MAX_STRICT = parseInt(process.env.RATE_LIMIT_MAX_STRICT || '20', 10);   // mutating endpoints
const MAX_GENERAL = parseInt(process.env.RATE_LIMIT_MAX_GENERAL || '100', 10); // read endpoints

// ── Key generator — rate limit by API key, not IP ─────────────────────────
// Keying by API key aligns with the auth model: each client identity (key)
// gets its own independent counter. IP-based limiting would penalise
// legitimate multi-tenant deployments sharing a single egress IP.
// Falls back to IP if no key is present (unauthenticated / malformed requests).
const keyGenerator = (req: Request): string => {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) return apiKey;
  return ipKeyGenerator(req.ip ?? '');
};

const errorResponse = (_req: Request, res: Response): void => {
  ApiResponseHandler.send(res, 429, { message: 'Too many requests — please try again later' });
};

// ── Strict limiter — mutating endpoints ───────────────────────────────────
// Applied to: POST /api/drones, POST /api/drones/:id/load,
//             PATCH /api/drones/:id/state, PUT /api/drones/:id/battery,
//             POST /api/medications, POST /api/storage/upload-url
export const strictLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_STRICT,
  keyGenerator,
  handler: errorResponse,
  standardHeaders: true,   // return RateLimit-* headers so clients can back off gracefully
  legacyHeaders: false,
});

// ── General limiter — read endpoints ──────────────────────────────────────
// Applied to all GET endpoints.
export const generalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_GENERAL,
  keyGenerator,
  handler: errorResponse,
  standardHeaders: true,
  legacyHeaders: false,
});

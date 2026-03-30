import { Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../src/middlewares/auth.middleware';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// Set known test keys before importing
process.env.ADMIN_API_KEY = 'test-admin-key';
process.env.READONLY_API_KEY = 'test-readonly-key';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers, ip: '127.0.0.1' } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('authenticate middleware', () => {
  it('calls next() and sets apiRole to admin for a valid admin key', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': 'test-admin-key' });
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiRole).toBe('admin');
  });

  it('calls next() and sets apiRole to readonly for a valid readonly key', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': 'test-readonly-key' });
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiRole).toBe('readonly');
  });

  it('returns 401 when X-Api-Key header is missing', () => {
    const { req, res, next } = mockReqRes({});
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the API key is invalid', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': 'wrong-key' });
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not set apiRole when authentication fails', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': 'bad-key' });
    authenticate(req, res, next);
    expect(req.apiRole).toBeUndefined();
  });
});

describe('requireAdmin middleware', () => {
  it('calls next() when role is admin', () => {
    const { req, res, next } = mockReqRes();
    req.apiRole = 'admin';
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when role is readonly', () => {
    const { req, res, next } = mockReqRes();
    req.apiRole = 'readonly';
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when no role is set', () => {
    const { req, res, next } = mockReqRes();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

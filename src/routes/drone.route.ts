import { Router } from 'express';
import { droneController } from '../controllers/drone.controller';
import { validate } from '../middlewares/validate.middleware';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { strictLimiter, generalLimiter } from '../middlewares/rate-limit.middleware';
import {
  RegisterDroneSchema,
  LoadDroneSchema,
  UpdateDroneStateSchema,
  UpdateBatterySchema,
  PaginationSchema,
} from '../validations';

const router = Router();

// All drone routes require authentication
router.use(authenticate);

// ── Read endpoints (readonly + admin) ────────────────────────────────────

router.get('/', generalLimiter, validate(PaginationSchema, 'query'), droneController.getAll);
router.get('/available', generalLimiter, droneController.getAvailable);
router.get(
  '/audit-logs',
  generalLimiter,
  validate(PaginationSchema, 'query'),
  droneController.getAuditLogs
);

router.get('/:droneId', generalLimiter, droneController.getById);
router.get('/:droneId/medications', generalLimiter, droneController.getMedications);
router.get('/:droneId/battery', generalLimiter, droneController.getBatteryLevel);
router.get(
  '/:droneId/audit-logs',
  generalLimiter,
  validate(PaginationSchema, 'query'),
  droneController.getAuditLogs
);

// ── Mutating endpoints (admin only) ──────────────────────────────────────

router.post(
  '/',
  strictLimiter,
  requireAdmin,
  validate(RegisterDroneSchema),
  droneController.register
);
router.post(
  '/:droneId/load',
  strictLimiter,
  requireAdmin,
  validate(LoadDroneSchema),
  droneController.load
);
router.put(
  '/:droneId/state',
  strictLimiter,
  requireAdmin,
  validate(UpdateDroneStateSchema),
  droneController.updateState
);
router.put(
  '/:droneId/battery',
  strictLimiter,
  requireAdmin,
  validate(UpdateBatterySchema),
  droneController.updateBattery
);

export default router;

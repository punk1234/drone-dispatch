import { Router } from 'express';
import { medicationController } from '../controllers/medication.controller';
import { validate } from '../middlewares/validate.middleware';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { strictLimiter, generalLimiter } from '../middlewares/rate-limit.middleware';
import { CreateMedicationSchema, GetMedicationByCodeSchema, PaginationSchema } from '../validations';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  strictLimiter,
  requireAdmin,
  validate(CreateMedicationSchema),
  medicationController.create
);

router.get('/', generalLimiter, validate(PaginationSchema, 'query'), medicationController.getAll);
router.get('/:code', generalLimiter, validate(GetMedicationByCodeSchema, 'params'), medicationController.getByCode);

export default router;

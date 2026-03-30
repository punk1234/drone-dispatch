import { Router } from 'express';
import { storageController } from '../controllers/storage.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { strictLimiter } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { PresignedUrlQuerySchema, PresignedUrlSchema } from '../validations';

const router = Router();
router.use(authenticate);

router.post(
  '/upload-url',
  strictLimiter,
  requireAdmin,
  validate(PresignedUrlSchema),
  validate(PresignedUrlQuerySchema, 'query'),
  storageController.getUploadUrl
);

export default router;

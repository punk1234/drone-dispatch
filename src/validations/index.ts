import { z } from 'zod';
import { DroneModel, DroneState } from '../types';

// ── Regex constants — declared first so schemas below can reference them ─

export const MedicationNameRegex = /^[a-zA-Z0-9\-_]+$/;
export const MedicationCodeRegex = /^[A-Z0-9_]+$/;

// ── Drone schemas ─────────────────────────────────────────────────────────

export const RegisterDroneSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .min(5, 'Valid serial number is required')
    .max(100, 'Serial number must not exceed 100 characters'),
  model: z.nativeEnum(DroneModel, {
    errorMap: () => ({
      message: `Model must be one of: ${Object.values(DroneModel).join(', ')}`,
    }),
  }),
  weightLimit: z
    .number({ required_error: 'Weight limit is required' })
    .positive('Weight limit must be positive')
    .max(500, 'Weight limit cannot exceed 500gr'),
  batteryCapacity: z
    .number({ required_error: 'Battery capacity is required' })
    .int('Battery capacity must be an integer')
    .min(0, 'Battery capacity cannot be negative')
    .max(100, 'Battery capacity cannot exceed 100%'),
  state: z.nativeEnum(DroneState).optional().default(DroneState.IDLE),
});

export const UpdateDroneStateSchema = z.object({
  state: z.nativeEnum(DroneState, {
    errorMap: () => ({
      message: `State must be one of: ${Object.values(DroneState).join(', ')}`,
    }),
  }),
});

export const UpdateBatterySchema = z.object({
  batteryCapacity: z
    .number({ required_error: 'Battery capacity is required' })
    .int('Battery capacity must be an integer')
    .min(0, 'Battery capacity cannot be negative')
    .max(100, 'Battery capacity cannot exceed 100%'),
});

export const LoadDroneSchema = z.object({
  medicationCodes: z
    .array(
      z
        .string()
        .min(1, 'Medication code cannot be empty')
        .regex(
          MedicationCodeRegex,
          'Each code must contain only uppercase letters, underscores, and numbers'
        )
    )
    .min(1, 'Atleast one medication code is required')
    .refine((items) => new Set(items).size === items.length, {
      message: 'All items in the array must be unique',
    }),
});

// ── Medication schemas ────────────────────────────────────────────────────

export const CreateMedicationSchema = z.object({
  name: z
    .string()
    .min(1, 'Medication name is required')
    .regex(MedicationNameRegex, 'Name can only contain letters, numbers, hyphens, and underscores'),
  weight: z
    .number({ required_error: 'Weight is required' })
    .positive('Weight must be a positive number'),
  code: z
    .string()
    .min(1, 'Medication code is required')
    .regex(
      MedicationCodeRegex,
      'Code can only contain uppercase letters, underscores, and numbers'
    ),
  // Optional — from pre-signed S3 upload or external CDN
  imageUrl: z.string().url('imageUrl must be a valid URL').optional(),
});

export const GetMedicationByCodeSchema = z.object({
  code: z
    .string()
    .min(1, 'Medication code is required')
    .regex(
      MedicationCodeRegex,
      'Code can only contain uppercase letters, underscores, and numbers'
    ),
});

// ── Storage schemas ───────────────────────────────────────────────────────

export const PresignedUrlSchema = z.object({
  extension: z
    .string()
    .min(1, 'File extension is required')
    .regex(/^\.(jpeg|jpg|png|gif|webp)$/i, 'Extension must be one of: .jpeg .jpg .png .gif .webp'),
  mimeType: z
    .string()
    .min(1, 'mimeType is required')
    .regex(/^image\/(jpeg|png|gif|webp)$/, 'mimeType must be an image type'),
});

const ALLOWED_TYPES = ['medication'] as const;
export const PresignedUrlQuerySchema = z.object({
  type: z.enum(ALLOWED_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${ALLOWED_TYPES.join(', ')}` }),
  }),
});

// ── Generic schemas ───────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type RegisterDroneInput = z.infer<typeof RegisterDroneSchema>;
export type LoadDroneInput = z.infer<typeof LoadDroneSchema>;
export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>;
export type UpdateDroneStateInput = z.infer<typeof UpdateDroneStateSchema>;
export type UpdateBatteryInput = z.infer<typeof UpdateBatterySchema>;
export type PresignedUrlInput = z.infer<typeof PresignedUrlSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;

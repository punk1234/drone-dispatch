import { DroneState, Medication, Prisma } from "@prisma/client";
export { DroneState, DroneModel } from '@prisma/client';

export type DroneWithMedications = Prisma.DroneGetPayload<{
  include: {
    medications: {
      include: { medication: true };
    };
  };
}>;

export interface ApiResponse<T = unknown> {
  message: string;
  data?: T;
  error?: string;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface LoadCheckResult {
  medications: Array<{ code: string; weight: number; [key: string]: unknown }>;
  totalWeight: number;
}

/**
 * Medication with loadedAt timestamp — returned by getDroneMedications.
 */
export interface LoadedMedication extends Medication {
  loadedAt: Date;
}

export interface DroneBattery {
  id: string;
  serialNumber: string;
  batteryCapacity: number;
  state: DroneState;
}

/**
 * Narrow response for battery update — only the changed field + identifiers.
 */
export interface DroneBatteryUpdate {
  id: string;
  serialNumber: string;
  batteryCapacity: number;
}

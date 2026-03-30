import { prisma } from '../config/database';
import { DroneBattery, DroneState, PaginatedResult } from '../types';
import { RegisterDroneInput, PaginationInput } from '../validations';
import { DroneWithMedications } from '../types';
import { BatteryAuditLog, Prisma } from '@prisma/client';

const WITH_MEDICATIONS = {
  include: {
    medications: { include: { medication: true } },
  },
} as const;

const WITH_MEDICATIONS_ORDERED = {
  include: {
    medications: {
      include: { medication: true },
      orderBy: { loadedAt: 'desc' as const },
    },
  },
} as const;

/**
 * @class DroneRepository
 *
 * Encapsulates all Prisma operations for Drone and related models.
 * Services depend on this class — never on Prisma directly.
 */
export class DroneRepository {
  async create(data: RegisterDroneInput) {
    return prisma.drone.create({ data });
  }

  async findById(id: string): Promise<DroneWithMedications | null> {
    return prisma.drone.findUnique({ where: { id }, ...WITH_MEDICATIONS });
  }

  async findByIdWithOrderedMedications(id: string) {
    return prisma.drone.findUnique({ where: { id }, ...WITH_MEDICATIONS_ORDERED });
  }

  async findByIdLean(id: string) {
    return prisma.drone.findUnique({ where: { id } });
  }

  async findBattery(id: string): Promise<DroneBattery | null> {
    return prisma.drone.findUnique({
      where: { id },
      select: { id: true, serialNumber: true, batteryCapacity: true, state: true },
    });
  }

  async findAll(options: Prisma.DroneFindManyArgs) {
    return prisma.drone.findMany(options);
  }

  async findAvailable(minBattery: number) {
    return prisma.drone.findMany({
      where: {
        state: { in: [DroneState.IDLE, DroneState.LOADING] },
        batteryCapacity: { gte: minBattery },
      },
      orderBy: { batteryCapacity: 'desc' },
    });
  }

  async findAllPaginated(
    pagination: Required<PaginationInput>
  ): Promise<PaginatedResult<DroneWithMedications>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.drone.findMany({
        ...WITH_MEDICATIONS,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.drone.count(),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Removes all loaded medications from a drone.
   * Called automatically when state transitions to IDLE or DELIVERED.
   */
  async clearMedications(droneId: string): Promise<void> {
    await prisma.droneMedication.deleteMany({ where: { droneId } });
  }

  async updateState(id: string, state: DroneState) {
    return prisma.drone.update({ where: { id }, data: { state } });
  }

  async updateBattery(id: string, batteryCapacity: number) {
    return prisma.drone.update({ where: { id }, data: { batteryCapacity } });
  }

  async loadMedications(droneId: string, medicationCodes: string[]): Promise<DroneWithMedications> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.droneMedication.createMany({
        data: medicationCodes.map((medicationCode) => ({ droneId, medicationCode })),
      });

      return tx.drone.update({
        where: { id: droneId },
        data: { state: DroneState.LOADING },
        ...WITH_MEDICATIONS,
      });
    }) as Promise<DroneWithMedications>;
  }
}

export class AuditLogRepository {
  async createMany(
    entries: Array<{
      droneId: string;
      serialNumber: string;
      batteryCapacity: number;
      state: DroneState;
    }>
  ) {
    return prisma.batteryAuditLog.createMany({ data: entries });
  }

  async findPaginated(
    pagination: Required<PaginationInput>,
    droneId?: string
  ): Promise<PaginatedResult<BatteryAuditLog>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    const where = droneId ? { droneId } : {};

    const [data, total] = await Promise.all([
      prisma.batteryAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.batteryAuditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

export const droneRepository = new DroneRepository();
export const auditLogRepository = new AuditLogRepository();

import { Medication } from '@prisma/client';
import { prisma } from '../config/database';
import { PaginatedResult } from '../types';
import { CreateMedicationInput, PaginationInput } from '../validations';

/**
 * @class MedicationRepository
 *
 * Encapsulates all Prisma operations for the Medication model.
 */
export class MedicationRepository {
  async create(data: CreateMedicationInput & { imageUrl?: string }) {
    return prisma.medication.create({ data });
  }

  async findByCode(code: string) {
    return prisma.medication.findUnique({ where: { code } });
  }

  async findByCodes(codes: string[]) {
    return prisma.medication.findMany({ where: { code: { in: codes } } });
  }

  async findAll() {
    return prisma.medication.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findAllPaginated(
    pagination: Required<PaginationInput>
  ): Promise<PaginatedResult<Medication>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.medication.findMany({ orderBy: { createdAt: 'asc' }, skip, take: limit }),
      prisma.medication.count(),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

export const medicationRepository = new MedicationRepository();

import { CreateMedicationInput, PaginationInput } from '../validations';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';
import { BaseService } from './base.service';
import { MedicationRepository, medicationRepository } from '../repositories/medication.repository';
import { Medication } from '@prisma/client';
import { PaginatedResult } from '../types';

export class MedicationService extends BaseService {
  constructor(private readonly medicationRepo: MedicationRepository) {
    super();
  }

  /**
   * @method createMedication
   * @async
   * @param {CreateMedicationInput} data
   * @param {string} imageUrl
   * @returns {Promise<Medication>}
   */
  async createMedication(data: CreateMedicationInput, imageUrl?: string): Promise<Medication> {
    try {
      const medication = await this.medicationRepo.create({ ...data, imageUrl });

      logger.info(`Medication created: ${medication.code}`);
      return medication;
    } catch (err: unknown) {
      if (this.isDatabaseUniqueConstraint(err)) {
        throw new AppError(`Medication with code '${data.code}' already exists`, 409);
      }
      throw err;
    }
  }

  /**
   * @method getAllMedications
   * @async
   * @param {Required<PaginationInput>} paginationOpts
   * @returns {Promise<Medication[]>}
   */
  async getAllMedications(
    paginationOpts: Required<PaginationInput>
  ): Promise<PaginatedResult<Medication>> {
    return this.medicationRepo.findAllPaginated(paginationOpts);
  }

  /**
   * @method getMedicationByCode
   * @async
   * @param {string} code
   * @returns {Promise<Medication>}
   */
  async getMedicationByCode(code: string): Promise<Medication> {
    const medication = await this.medicationRepo.findByCode(code);
    if (!medication) throw new AppError('Medication not found', 404);
    return medication;
  }
}

export const medicationService = new MedicationService(medicationRepository);

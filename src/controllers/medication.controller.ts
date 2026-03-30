import { Request, Response, NextFunction } from 'express';
import { medicationService } from '../services/medication.service';
import { CreateMedicationInput } from '../validations';
import { Controller } from '../decorators';
import { ApiResponseHandler } from '../utils/api-response.handler';

@Controller()
export class MedicationController {
  /**
   * @method create
   * @async
   * @desc Create medication
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = req.body as CreateMedicationInput;
    const medication = await medicationService.createMedication(data, data.imageUrl);

    ApiResponseHandler.created(res, { data: medication, message: 'Medication created successfully' });
  }

  /**
   * @method getAll
   * @async
   * @desc List medications
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    const medicationsInfo = await medicationService.getAllMedications({
      page: parseInt(<string>req.query?.page) || 1,
      limit: parseInt(<string>req.query?.limit) || 20
    });

    ApiResponseHandler.ok(res, medicationsInfo);
  }

  /**
   * @method getByCode
   * @async
   * @desc Get medication by code
   */
  async getByCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    const medication = await medicationService.getMedicationByCode(req.params.code as string);

    ApiResponseHandler.ok(res, { data: medication, message: 'Medication retrieved' });
  }
}

export const medicationController = new MedicationController();

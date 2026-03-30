import { Request, Response, NextFunction } from 'express';
import { droneService } from '../services/drone.service';
import { RegisterDroneInput, LoadDroneInput, UpdateDroneStateInput, UpdateBatteryInput, PaginationSchema, PaginationInput } from '../validations';
import { Controller } from '../decorators';
import { auditLogService } from '../services/audit-log.service';
import { ApiResponseHandler } from '../utils/api-response.handler';

@Controller()
export class DroneController {
  /**
   * @method register
   * @async
   * @desc Register/Add drone
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = req.body as RegisterDroneInput;
    const drone = await droneService.registerDrone(data);

    ApiResponseHandler.created(res, { message: 'Drone registered successfully', data: drone });
  }

  /**
   * @method load
   * @async
   * @desc Laod drone with medications
   */
  async load(req: Request, res: Response, next: NextFunction): Promise<void> {
    const droneId = req.params.droneId as string;
    const payload = req.body as LoadDroneInput;

    const drone = await droneService.loadDrone(droneId, payload);
    ApiResponseHandler.ok(res, { message: 'Drone loaded successfully', data: drone })
  }

  /**
   * @method getMedications
   * @async
   * @desc List medications
   */
  async getMedications(req: Request, res: Response, next: NextFunction): Promise<void> {
    const droneId = req.params.droneId as string;
    const medications = await droneService.getDroneMedications(droneId);

    ApiResponseHandler.ok(res, { message: 'Medications retrieved', data: medications })
  }

  /**
   * @method getAvailable
   * @async
   * @desc List available drones
   */
  async getAvailable(req: Request, res: Response, next: NextFunction): Promise<void> {
    const drones = await droneService.getAvailableDrones();

    ApiResponseHandler.ok(res, {
      message: 'Available drones retrieved',
      data: drones,
      count: drones.length,
    });
  }

  /**
   * @method getBatteryLevel
   * @async
   * @desc Get battery level
   */
  async getBatteryLevel(req: Request, res: Response, next: NextFunction): Promise<void> {
    const droneId = req.params.droneId as string;
    const data = await droneService.getDroneBattery(droneId);

    ApiResponseHandler.ok(res, { message: 'Battery level retrieved', data });
  }

  /**
   * @method getAll
   * @async
   * @desc List drones
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    const dronesInfo = await droneService.getAllDrones({
      page: parseInt(<string>req.query?.page) || 1,
      limit: parseInt(<string>req.query?.limit) || 20
    });

    ApiResponseHandler.ok(res, { message: 'Drones retrieved', ...dronesInfo });
  }

  /**
   * @method getById
   * @async
   * @desc Get medication by ID
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    const drone = await droneService.getDroneById(req.params.droneId as string);

    ApiResponseHandler.ok(res, { message: 'Drone retrieved', data: drone });
  }

  /**
   * @method updateState
   * @async
   * @desc Update drone state
   */
  async updateState(req: Request, res: Response, next: NextFunction): Promise<void> {
    const droneId = req.params.droneId as string;
    const { state } = req.body as UpdateDroneStateInput;

    const drone = await droneService.updateDroneState(droneId, state);
    ApiResponseHandler.ok(res, { message: 'Drone state updated', data: drone });
  }

  /**
   * @method updateBattery
   * @async
   * @desc Update battery level
   */
  async updateBattery(req: Request, res: Response, next: NextFunction): Promise<void> {
    const droneId = req.params.droneId as string;
    const { batteryCapacity } = req.body as UpdateBatteryInput;

    const drone = await droneService.updateBattery(droneId, batteryCapacity);
    ApiResponseHandler.ok(res, { message: 'Battery level updated', data: drone });
  }

  /**
   * @method getAuditLogs
   * @async
   * @desc List audit logs
   */
  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    const droneId = req.params.droneId as string;

    const logsInfo = await auditLogService.getAuditLogs({
      page: parseInt(<string>req.query?.page) || 1,
      limit: parseInt(<string>req.query?.limit) || 20
    }, droneId);

    ApiResponseHandler.ok(res, { message: 'Audit logs retrieved', ...logsInfo });
  }
}

export const droneController = new DroneController();

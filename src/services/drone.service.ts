import { CACHE_KEYS, CACHE_TTL } from '../config/redis';
import { RegisterDroneInput, LoadDroneInput, PaginationInput } from '../validations';
import { DroneBattery, DroneBatteryUpdate, DroneState, LoadCheckResult, LoadedMedication, PaginatedResult } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';
import { publishDroneEvent } from '../utils/rabbitmq.publisher';
import { ROUTING_KEYS } from '../config/rabbitmq';
import type { Drone } from '@prisma/client/index';
import { BaseService } from './base.service';
import { DroneRepository, droneRepository } from '../repositories/drone.repository';
import { DroneWithMedications } from '../types';
import { CacheService, cacheService } from '../utils/cache.service';
import { MedicationRepository, medicationRepository } from '../repositories/medication.repository';

// ── State machine ────────────────────────────────────────────────────────────
//
// Defines the only valid state transitions. Any transition not listed here
// will be rejected with a 422 before the DB is touched.
//
//   IDLE → LOADING
//   LOADING → IDLE         (load cancelled — medications cleared)
//   LOADING → LOADED       (loading complete, ready for dispatch)
//   LOADED → LOADING       (adding more items before final dispatch)
//   LOADED → DELIVERING    (drone dispatched)
//   LOADED → IDLE          (load abandoned — medications cleared)
//   DELIVERING → DELIVERED (arrived at destination — medications cleared)
//   DELIVERED → RETURNING  (drone heading back to base)
//   RETURNING → IDLE       (back at base, ready for next load)

const VALID_TRANSITIONS: Readonly<Record<DroneState, DroneState[]>> = {
  [DroneState.IDLE]:       [DroneState.LOADING],
  [DroneState.LOADING]:    [DroneState.IDLE, DroneState.LOADED],
  [DroneState.LOADED]:     [DroneState.LOADING, DroneState.DELIVERING, DroneState.IDLE],
  [DroneState.DELIVERING]: [DroneState.DELIVERED],
  [DroneState.DELIVERED]:  [DroneState.RETURNING],
  [DroneState.RETURNING]:  [DroneState.IDLE],
};

function assertValidTransition(from: DroneState, to: DroneState): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new AppError(
      `Invalid state transition: ${from} → ${to}. Allowed from ${from}: ${allowed.join(', ')}`,
      422
    );
  }
}

const MIN_BATTERY_FOR_LOADING = 25;

export class DroneService extends BaseService {
  constructor(
    private readonly droneRepo: DroneRepository,
    private readonly medicationRepo: MedicationRepository,
    private readonly cache: CacheService,
  ) {
    super();
  }

  /**
   * @method registerDrone
   * @async
   * @param {RegisterDroneInput} data 
   * @returns {Promise<Drone>}
   */
  async registerDrone(data: RegisterDroneInput): Promise<Drone> {
    let drone;
    try {
      drone = await this.droneRepo.create(data);
    } catch (err: unknown) {
      if (this.isDatabaseUniqueConstraint(err)) {
        throw new AppError(`Drone with serial number '${data.serialNumber}' already exists`, 409);
      }
      throw err;
    }

    await this.invalidateAvailableCache();

    // Publish event — non-blocking, failure is logged not thrown
    await publishDroneEvent(ROUTING_KEYS.DRONE_REGISTERED, drone.id, drone.serialNumber, {
      model: drone.model,
      weightLimit: drone.weightLimit,
      batteryCapacity: drone.batteryCapacity,
      state: drone.state,
    });

    logger.info(`Drone registered: ${drone.serialNumber}`);
    return drone;
  }

  /**
   * @method loadDrone
   * @async
   * @param {string} droneId 
   * @param {LoadDroneInput} payload 
   * @returns {Promise<DroneWithMedications>}
   */
  async loadDrone(droneId: string, payload: LoadDroneInput): Promise<DroneWithMedications> {
    const droneWithMedications = await this.droneRepo.findById(droneId);
    if (!droneWithMedications) throw new AppError('Drone not found', 404);

    const { medications, totalWeight } =  await this.checkThatDroneCanBeLoaded(droneWithMedications, payload);
    const result = await this.droneRepo.loadMedications(droneId, payload.medicationCodes);

    await this.invalidateAvailableCache();

    await publishDroneEvent(ROUTING_KEYS.DRONE_LOADED, droneWithMedications.id, droneWithMedications.serialNumber, {
      medicationCodes: payload.medicationCodes,
      totalWeight,
      batteryCapacity: droneWithMedications.batteryCapacity,
    });

    logger.info(`Drone ${droneWithMedications.serialNumber} loaded with ${medications.length} medication(s)`);
    return result;
  }

  /**
   * @method getDroneMedications
   * @async
   * @param {string} droneId 
   * @returns {Promise<LoadedMedication[]>}
   */
  async getDroneMedications(droneId: string): Promise<LoadedMedication[]> {
    const drone = await this.droneRepo.findByIdWithOrderedMedications(droneId)
    if (!drone) throw new AppError('Drone not found', 404);

    return drone.medications.map((dm: { medication: { code: string; name: string; weight: number; imageUrl: string | null; createdAt: Date; updatedAt: Date }; loadedAt: Date }) => ({
      code:      dm.medication.code,
      name:      dm.medication.name,
      weight:    dm.medication.weight,
      imageUrl:  dm.medication.imageUrl,
      createdAt: dm.medication.createdAt,
      updatedAt: dm.medication.updatedAt,
      loadedAt:  dm.loadedAt,
    }));
  }

  /**
   * @method getAvailableDrones
   * @async
   * @returns {Promise<Drone[]>}
   */
  async getAvailableDrones(): Promise<Drone[]> {
    const cached = await this.cache.get<Drone[]>(CACHE_KEYS.AVAILABLE_DRONES);
    if (cached) return cached;

    const drones = await this.droneRepo.findAvailable(MIN_BATTERY_FOR_LOADING);
    await this.cache.set(CACHE_KEYS.AVAILABLE_DRONES, drones, CACHE_TTL);
    return drones;
  }

  /**
   * @method getDroneBattery
   * @async
   * @param {string} droneId
   * @returns {Promise<DroneBattery>}
   */
  async getDroneBattery(droneId: string): Promise<DroneBattery> {
    const drone = await this.droneRepo.findBattery(droneId);
    if (!drone) throw new AppError('Drone not found', 404);

    return drone;
  }

  /**
   * @method getAllDrones
   * @async
   * @param {Required<PaginationInput>} pagination
   * @returns {Promise<PaginatedResult<DroneWithMedications>>}
   */
  async getAllDrones(pagination: Required<PaginationInput>): Promise<PaginatedResult<DroneWithMedications>> {
    return this.droneRepo.findAllPaginated(pagination);
  }

  /**
   * @method getDroneById
   * @async
   * @param {string} droneId 
   * @returns {Promise<Drone>}
   */
  async getDroneById(droneId: string): Promise<Drone> {
    const drone = await this.droneRepo.findById(droneId);
    if (!drone) throw new AppError('Drone not found', 404);

    return drone;
  }

  /**
   * @method updateDroneState
   * @async
   * @param {string} droneId 
   * @param {DroneState} state 
   * @returns {Promise<Drone>}
   */
  async updateDroneState(droneId: string, state: DroneState): Promise<Drone> {
    const drone = await this.droneRepo.findByIdLean(droneId);
    if (!drone) throw new AppError('Drone not found', 404);

    assertValidTransition(drone.state as DroneState, state);

    // Clear loaded medications on terminal/reset states:
    // DELIVERED — payload has been handed off at destination
    // IDLE      — load was cancelled or drone has returned and is being reset
    const shouldClearMedications =
      state === DroneState.DELIVERED || state === DroneState.IDLE;

    if (shouldClearMedications) {
      await this.droneRepo.clearMedications(droneId);
    }

    const updated = await this.droneRepo.updateState(droneId, state);

    await this.invalidateAvailableCache();

    await publishDroneEvent(ROUTING_KEYS.DRONE_STATE_CHANGED, drone.id, drone.serialNumber, {
      previousState:      drone.state,
      newState:           state,
      medicationsCleared: shouldClearMedications,
    });

    return updated;
  }

  /**
   * @method updateBattery
   * @async
   * @param {string} droneId 
   * @param {number} batteryCapacity 
   * @returns {Promise<DroneBatteryUpdate>}
   */
  async updateBattery(droneId: string, batteryCapacity: number): Promise<DroneBatteryUpdate> {
    const drone = await this.droneRepo.findByIdLean(droneId);
    if (!drone) throw new AppError('Drone not found', 404);

    const updated = await this.droneRepo.updateBattery(droneId, batteryCapacity);

    // Invalidate available drones cache — a battery change can affect eligibility
    await this.invalidateAvailableCache();

    logger.info(`Drone ${drone.serialNumber} battery updated to ${batteryCapacity}%`);
    return updated;
  }

  /**
   * @method checkThatDroneCanBeLoaded
   * @async
   * @param {DroneWithMedications} drone 
   * @param {LoadDroneInput} payload 
   * @returns {Promise<LoadCheckResult>}
   */
  private async checkThatDroneCanBeLoaded(drone: DroneWithMedications, payload: LoadDroneInput): Promise<LoadCheckResult> {
    if (drone.batteryCapacity < MIN_BATTERY_FOR_LOADING) {
      throw new AppError(`Drone battery is at ${drone.batteryCapacity}% — cannot load below ${MIN_BATTERY_FOR_LOADING}%`, 422);
    }

    if (drone.state !== DroneState.IDLE && drone.state !== DroneState.LOADING) {
      throw new AppError(`Drone is currently in '${drone.state}' state and cannot be loaded`, 422);
    }

    const medications = await this.medicationRepo.findByCodes(payload.medicationCodes);

    if (medications.length !== payload.medicationCodes.length) {
      const foundCodes = medications.map((m: { code: string }) => m.code);
      const missing = payload.medicationCodes.filter((code) => !foundCodes.includes(code));
      throw new AppError(`Medications not found: ${missing.join(', ')}`, 404);
    }

    const alreadyLoaded = drone.medications.map((dm: { medicationCode: string }) => dm.medicationCode);
    const duplicates = payload.medicationCodes.filter((code) => alreadyLoaded.includes(code));
    if (duplicates.length > 0) {
      throw new AppError(
        `Some medications are already loaded on this drone: ${duplicates.join(', ')}`,
        409
      );
    }

    const currentWeight = drone.medications.reduce(
      (sum: number, dm: { medication: { weight: number } }) => sum + dm.medication.weight,
      0
    );
    const newWeight = medications.reduce((sum: number, m: { weight: number }) => sum + m.weight, 0);
    const totalWeight = currentWeight + newWeight;

    if (totalWeight > drone.weightLimit) {
      throw new AppError(`Total weight (${totalWeight}gr) exceeds drone weight limit (${drone.weightLimit}gr)`, 422);
    }

    return {
      medications,
      totalWeight
    };
  }

  private async invalidateAvailableCache(): Promise<void> {
    await this.cache.del(CACHE_KEYS.AVAILABLE_DRONES);
  }
}

export const droneService = new DroneService(
  droneRepository,
  medicationRepository,
  cacheService
);

import { DroneService } from '../src/services/drone.service';
import { DroneModel, DroneState } from '../src/types';
import { DroneRepository, AuditLogRepository } from '../src/repositories/drone.repository';
import { MedicationRepository } from '../src/repositories/medication.repository';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Prevent PrismaClient from initialising — repositories are fully mocked
jest.mock('../src/config/database', () => ({ prisma: {} }));

jest.mock('../src/config/redis', () => ({
  CACHE_KEYS: { AVAILABLE_DRONES: 'drones:available' },
  CACHE_TTL: 30,
}));

jest.mock('../src/utils/cache.service', () => ({
  cacheService: {}, // not used directly — tests inject mockCacheService
  CacheService: jest.fn(),
}));

jest.mock('../src/utils/rabbitmq.publisher', () => ({
  publishDroneEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config/rabbitmq', () => ({
  ROUTING_KEYS: {
    DRONE_REGISTERED: 'drone.registered',
    DRONE_LOADED: 'drone.loaded',
    DRONE_STATE_CHANGED: 'drone.state_changed',
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// ── Cache mock ────────────────────────────────────────────────────────────────

const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCacheDel = jest.fn().mockResolvedValue(undefined);

const mockCache = {
  get: mockCacheGet,
  set: mockCacheSet,
  del: mockCacheDel,
};

// ── Repository mocks ───────────────────────────────────────────────────────

const mockDroneRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findByIdLean: jest.fn(),
  findByIdWithOrderedMedications: jest.fn(),
  findBattery: jest.fn(),
  findAvailable: jest.fn(),
  findAllPaginated: jest.fn(),
  updateState: jest.fn(),
  updateBattery: jest.fn(),
  loadMedications: jest.fn(),
  clearMedications: jest.fn().mockResolvedValue(undefined),
} as unknown as DroneRepository;

const mockAuditRepo = {
  createMany: jest.fn(),
  findPaginated: jest.fn(),
} as unknown as AuditLogRepository;

const mockMedRepo = {
  create: jest.fn(),
  findByCode: jest.fn(),
  findByCodes: jest.fn(),
  findAll: jest.fn(),
} as unknown as MedicationRepository;

// ── Fixtures ───────────────────────────────────────────────────────────────

const baseDrone = {
  id: 'drone-uuid-1',
  serialNumber: 'DRN-TEST-001',
  model: DroneModel.Heavyweight,
  weightLimit: 500,
  batteryCapacity: 80,
  state: DroneState.IDLE,
  createdAt: new Date(),
  updatedAt: new Date(),
  medications: [] as Array<{
    medicationCode: string;
    loadedAt: Date;
    medication: { weight: number; code: string };
  }>,
};

const pagination = { page: 1, limit: 20 };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DroneService', () => {
  let service: DroneService;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new DroneService(mockDroneRepo, mockMedRepo, mockCache as any);
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // ── registerDrone ─────────────────────────────────────────────────────────

  describe('registerDrone', () => {
    const input = {
      serialNumber: 'DRN-NEW-001',
      model: DroneModel.Heavyweight,
      weightLimit: 500,
      batteryCapacity: 90,
      state: DroneState.IDLE,
    };

    it('registers a drone with a single DB call and returns it', async () => {
      const created = { id: 'new-uuid', ...input, createdAt: new Date(), updatedAt: new Date() };
      (mockDroneRepo.create as jest.Mock).mockResolvedValue(created);

      const result = await service.registerDrone(input);

      expect(result).toEqual(created);
      expect(mockDroneRepo.create).toHaveBeenCalledWith(input);
    });

    it('invalidates the cache on successful registration', async () => {
      (mockDroneRepo.create as jest.Mock).mockResolvedValue({ ...baseDrone, ...input });

      await service.registerDrone(input);

      expect(mockCacheDel).toHaveBeenCalledWith('drones:available');
    });

    it('throws AppError 409 on duplicate serial number (P2002)', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      (mockDroneRepo.create as jest.Mock).mockRejectedValue(prismaError);

      await expect(service.registerDrone(input)).rejects.toMatchObject({
        message: "Drone with serial number 'DRN-NEW-001' already exists",
        statusCode: 409,
      });
    });

    it('does not swallow unrelated errors', async () => {
      (mockDroneRepo.create as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      await expect(service.registerDrone(input)).rejects.toThrow('DB connection lost');
    });
  });

  // ── loadDrone ─────────────────────────────────────────────────────────────

  describe('loadDrone', () => {
    const twoMeds = [
      { code: 'MED_A', weight: 100 },
      { code: 'MED_B', weight: 80 },
    ];

    const setupLoad = (droneOverrides = {}, medsToReturn = twoMeds) => {
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue({ ...baseDrone, ...droneOverrides });
      (mockMedRepo.findByCodes as jest.Mock).mockResolvedValue(medsToReturn);
      (mockDroneRepo.loadMedications as jest.Mock).mockResolvedValue({
        ...baseDrone,
        ...droneOverrides,
        state: DroneState.LOADING,
      });
    };

    it('loads medications and transitions state to LOADING', async () => {
      setupLoad();

      const result = await service.loadDrone('drone-uuid-1', {
        medicationCodes: ['MED_A', 'MED_B'],
      });

      expect(result.state).toBe(DroneState.LOADING);
      expect(mockDroneRepo.loadMedications).toHaveBeenCalledWith('drone-uuid-1', [
        'MED_A',
        'MED_B',
      ]);
    });

    it('allows loading onto a LOADING state drone', async () => {
      setupLoad({ state: DroneState.LOADING });
      const result = await service.loadDrone('drone-uuid-1', {
        medicationCodes: ['MED_A', 'MED_B'],
      });
      expect(result.state).toBe(DroneState.LOADING);
    });

    it('throws 404 if drone not found', async () => {
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.loadDrone('x', { medicationCodes: ['MED_A'] })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 422 if battery below 25%', async () => {
      setupLoad({ batteryCapacity: 24 });
      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A'] })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('throws 422 if battery is exactly 0%', async () => {
      setupLoad({ batteryCapacity: 0 });
      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A'] })
      ).rejects.toThrow('battery');
    });

    it('allows loading at exactly 25% battery', async () => {
      setupLoad({ batteryCapacity: 25 });
      const result = await service.loadDrone('drone-uuid-1', {
        medicationCodes: ['MED_A', 'MED_B'],
      });
      expect(result.state).toBe(DroneState.LOADING);
    });

    it.each([DroneState.LOADED, DroneState.DELIVERING, DroneState.DELIVERED, DroneState.RETURNING])(
      'throws 422 when drone is in %s state',
      async (state) => {
        setupLoad({ state });
        await expect(
          service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A'] })
        ).rejects.toMatchObject({ statusCode: 422 });
      }
    );

    it('throws 422 when weight exceeds limit', async () => {
      setupLoad({ weightLimit: 50 }, [{ code: 'MED_A', weight: 51 }]);
      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A'] })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('throws 422 when cumulative weight (existing + new) exceeds limit', async () => {
      const droneWithLoaded = {
        ...baseDrone,
        weightLimit: 150,
        medications: [
          {
            medicationCode: 'MED_EXISTING',
            loadedAt: new Date(),
            medication: { weight: 100, code: 'MED_EXISTING' },
          },
        ],
      };
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(droneWithLoaded);
      (mockMedRepo.findByCodes as jest.Mock).mockResolvedValue([{ code: 'MED_A', weight: 60 }]);

      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A'] })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('allows loading at exactly the weight limit', async () => {
      setupLoad({ weightLimit: 180 }, [
        { code: 'MED_A', weight: 100 },
        { code: 'MED_B', weight: 80 },
      ]);
      const result = await service.loadDrone('drone-uuid-1', {
        medicationCodes: ['MED_A', 'MED_B'],
      });
      expect(result.state).toBe(DroneState.LOADING);
    });

    it('throws 404 when none of the medication codes exist', async () => {
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(baseDrone);
      (mockMedRepo.findByCodes as jest.Mock).mockResolvedValue([]);
      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['GHOST_A'] })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 404 when some medication codes are missing', async () => {
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(baseDrone);
      (mockMedRepo.findByCodes as jest.Mock).mockResolvedValue([{ code: 'MED_A', weight: 50 }]);
      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A', 'GHOST_B'] })
      ).rejects.toThrow('GHOST_B');
    });

    it('throws 409 if a medication is already loaded on the drone', async () => {
      const droneWithLoaded = {
        ...baseDrone,
        medications: [
          {
            medicationCode: 'MED_A',
            loadedAt: new Date(),
            medication: { weight: 50, code: 'MED_A' },
          },
        ],
      };
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(droneWithLoaded);
      (mockMedRepo.findByCodes as jest.Mock).mockResolvedValue([{ code: 'MED_A', weight: 50 }]);

      await expect(
        service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A'] })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('invalidates available cache after successful load', async () => {
      setupLoad();
      await service.loadDrone('drone-uuid-1', { medicationCodes: ['MED_A', 'MED_B'] });
      expect(mockCacheDel).toHaveBeenCalledWith('drones:available');
    });
  });

  // ── getDroneMedications ───────────────────────────────────────────────────

  describe('getDroneMedications', () => {
    it('returns medications with load timestamps', async () => {
      const loadedAt = new Date();
      (mockDroneRepo.findByIdWithOrderedMedications as jest.Mock).mockResolvedValue({
        ...baseDrone,
        medications: [
          {
            medicationCode: 'AMX_500',
            loadedAt,
            medication: {
              code: 'AMX_500',
              name: 'Amoxicillin_500mg',
              weight: 50,
              imageUrl: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      });

      const result = await service.getDroneMedications('drone-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ code: 'AMX_500', loadedAt });
    });

    it('returns empty array for drone with no medications', async () => {
      (mockDroneRepo.findByIdWithOrderedMedications as jest.Mock).mockResolvedValue({
        ...baseDrone,
        medications: [],
      });
      expect(await service.getDroneMedications('drone-uuid-1')).toEqual([]);
    });

    it('throws 404 if drone not found', async () => {
      (mockDroneRepo.findByIdWithOrderedMedications as jest.Mock).mockResolvedValue(null);
      await expect(service.getDroneMedications('x')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── getAvailableDrones ────────────────────────────────────────────────────

  describe('getAvailableDrones', () => {
    const available = [
      { ...baseDrone, batteryCapacity: 90 },
      { ...baseDrone, id: 'drone-uuid-2', batteryCapacity: 60 },
    ];

    it('queries IDLE drones with battery >= 25%', async () => {
      (mockDroneRepo.findAvailable as jest.Mock).mockResolvedValue(available);
      await service.getAvailableDrones();
      expect(mockDroneRepo.findAvailable).toHaveBeenCalledWith(25);
    });

    it('returns empty array when no drones available', async () => {
      (mockDroneRepo.findAvailable as jest.Mock).mockResolvedValue([]);
      expect(await service.getAvailableDrones()).toEqual([]);
    });

    it('serves from cache when present', async () => {
      mockCacheGet.mockResolvedValueOnce(available);
      const result = await service.getAvailableDrones();
      expect(result).toEqual(available);
      expect(mockDroneRepo.findAvailable).not.toHaveBeenCalled();
    });

    it('writes to Redis after a DB fetch', async () => {
      (mockDroneRepo.findAvailable as jest.Mock).mockResolvedValue(available);
      await service.getAvailableDrones();
      expect(mockCacheSet).toHaveBeenCalledWith('drones:available', available, 30);
    });

    it('falls through to DB when cache returns null', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      (mockDroneRepo.findAvailable as jest.Mock).mockResolvedValue(available);
      const result = await service.getAvailableDrones();
      expect(result).toEqual(available);
      expect(mockDroneRepo.findAvailable).toHaveBeenCalled();
    });
  });

  // ── getDroneBattery ───────────────────────────────────────────────────────

  describe('getDroneBattery', () => {
    const battery = {
      id: 'drone-uuid-1',
      serialNumber: 'DRN-TEST-001',
      batteryCapacity: 75,
      state: DroneState.IDLE,
    };

    it('returns battery info', async () => {
      (mockDroneRepo.findBattery as jest.Mock).mockResolvedValue(battery);
      expect(await service.getDroneBattery('drone-uuid-1')).toEqual(battery);
    });

    it('returns 0% without throwing', async () => {
      (mockDroneRepo.findBattery as jest.Mock).mockResolvedValue({
        ...battery,
        batteryCapacity: 0,
      });
      expect((await service.getDroneBattery('drone-uuid-1')).batteryCapacity).toBe(0);
    });

    it('throws 404 if not found', async () => {
      (mockDroneRepo.findBattery as jest.Mock).mockResolvedValue(null);
      await expect(service.getDroneBattery('x')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── getAllDrones ──────────────────────────────────────────────────────────

  describe('getAllDrones', () => {
    it('returns paginated result', async () => {
      const paginated = {
        data: [baseDrone, { ...baseDrone, id: 'drone-uuid-2' }],
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      };
      (mockDroneRepo.findAllPaginated as jest.Mock).mockResolvedValue(paginated);
      const result = await service.getAllDrones(pagination);
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('returns empty data when fleet is empty', async () => {
      (mockDroneRepo.findAllPaginated as jest.Mock).mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
      const result = await service.getAllDrones(pagination);
      expect(result.data).toEqual([]);
    });
  });

  // ── getDroneById ──────────────────────────────────────────────────────────

  describe('getDroneById', () => {
    it('returns the drone when found', async () => {
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(baseDrone);
      expect(await service.getDroneById('drone-uuid-1')).toEqual(baseDrone);
    });

    it('throws 404 when not found', async () => {
      (mockDroneRepo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.getDroneById('x')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── updateDroneState ──────────────────────────────────────────────────────

  describe('updateDroneState', () => {
    it('updates state and invalidates cache', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue(baseDrone); // IDLE
      (mockDroneRepo.updateState as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.LOADING,
      });

      const result = await service.updateDroneState('drone-uuid-1', DroneState.LOADING);

      expect(result.state).toBe(DroneState.LOADING);
      expect(mockDroneRepo.updateState).toHaveBeenCalledWith('drone-uuid-1', DroneState.LOADING);
      expect(mockCacheDel).toHaveBeenCalledWith('drones:available');
    });

    it('throws 404 if drone not found', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue(null);
      await expect(service.updateDroneState('x', DroneState.LOADING)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    // ── Valid transitions ────────────────────────────────────────────────────

    it.each([
      [DroneState.IDLE, DroneState.LOADING],
      [DroneState.LOADING, DroneState.IDLE],
      [DroneState.LOADING, DroneState.LOADED],
      [DroneState.LOADED, DroneState.LOADING],
      [DroneState.LOADED, DroneState.DELIVERING],
      [DroneState.LOADED, DroneState.IDLE],
      [DroneState.DELIVERING, DroneState.DELIVERED],
      [DroneState.DELIVERED, DroneState.RETURNING],
      [DroneState.RETURNING, DroneState.IDLE],
    ])('allows valid transition %s → %s', async (from, to) => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue({ ...baseDrone, state: from });
      (mockDroneRepo.updateState as jest.Mock).mockResolvedValue({ ...baseDrone, state: to });

      await expect(service.updateDroneState('drone-uuid-1', to)).resolves.not.toThrow();
    });

    // ── Invalid transitions ──────────────────────────────────────────────────

    it.each([
      [DroneState.IDLE, DroneState.LOADED],
      [DroneState.IDLE, DroneState.DELIVERING],
      [DroneState.IDLE, DroneState.DELIVERED],
      [DroneState.IDLE, DroneState.RETURNING],
      [DroneState.LOADING, DroneState.DELIVERING],
      [DroneState.LOADING, DroneState.DELIVERED],
      [DroneState.LOADING, DroneState.RETURNING],
      [DroneState.LOADED, DroneState.DELIVERED],
      [DroneState.LOADED, DroneState.RETURNING],
      [DroneState.DELIVERING, DroneState.IDLE],
      [DroneState.DELIVERING, DroneState.LOADING],
      [DroneState.DELIVERING, DroneState.LOADED],
      [DroneState.DELIVERING, DroneState.RETURNING],
      [DroneState.DELIVERED, DroneState.IDLE],
      [DroneState.DELIVERED, DroneState.LOADING],
      [DroneState.DELIVERED, DroneState.LOADED],
      [DroneState.DELIVERED, DroneState.DELIVERING],
      [DroneState.RETURNING, DroneState.LOADING],
      [DroneState.RETURNING, DroneState.LOADED],
      [DroneState.RETURNING, DroneState.DELIVERING],
      [DroneState.RETURNING, DroneState.DELIVERED],
    ])('rejects invalid transition %s → %s with 422', async (from, to) => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue({ ...baseDrone, state: from });

      await expect(service.updateDroneState('drone-uuid-1', to)).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(mockDroneRepo.updateState).not.toHaveBeenCalled();
    });

    // ── Medication clearing ──────────────────────────────────────────────────

    it('clears medications when transitioning to DELIVERED', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.DELIVERING,
      });
      (mockDroneRepo.updateState as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.DELIVERED,
      });
      (mockDroneRepo.clearMedications as jest.Mock) = jest.fn().mockResolvedValue(undefined);

      await service.updateDroneState('drone-uuid-1', DroneState.DELIVERED);

      expect(mockDroneRepo.clearMedications).toHaveBeenCalledWith('drone-uuid-1');
    });

    it('clears medications when transitioning to IDLE', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.LOADED,
      });
      (mockDroneRepo.updateState as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.IDLE,
      });
      (mockDroneRepo.clearMedications as jest.Mock) = jest.fn().mockResolvedValue(undefined);

      await service.updateDroneState('drone-uuid-1', DroneState.IDLE);

      expect(mockDroneRepo.clearMedications).toHaveBeenCalledWith('drone-uuid-1');
    });

    it('does not clear medications for non-clearing transitions', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.IDLE,
      });
      (mockDroneRepo.updateState as jest.Mock).mockResolvedValue({
        ...baseDrone,
        state: DroneState.LOADING,
      });
      (mockDroneRepo.clearMedications as jest.Mock) = jest.fn();

      await service.updateDroneState('drone-uuid-1', DroneState.LOADING);

      expect(mockDroneRepo.clearMedications).not.toHaveBeenCalled();
    });
  });

  // ── updateBattery ─────────────────────────────────────────────────────────

  describe('updateBattery', () => {
    it('updates battery and invalidates cache', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue(baseDrone);
      (mockDroneRepo.updateBattery as jest.Mock).mockResolvedValue({
        ...baseDrone,
        batteryCapacity: 50,
      });

      const result = await service.updateBattery('drone-uuid-1', 50);

      expect(result.batteryCapacity).toBe(50);
      expect(mockCacheDel).toHaveBeenCalledWith('drones:available');
    });

    it('throws 404 if drone not found', async () => {
      (mockDroneRepo.findByIdLean as jest.Mock).mockResolvedValue(null);
      await expect(service.updateBattery('x', 50)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});

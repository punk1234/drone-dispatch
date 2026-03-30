import { MedicationService } from '../src/services/medication.service';
import { MedicationRepository } from '../src/repositories/medication.repository';
import { AppError } from '../src/middlewares/error.middleware';

// Prevent PrismaClient from initialising — repository is fully mocked
jest.mock('../src/config/database', () => ({ prisma: {} }));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// ── Repository mock ───────────────────────────────────────────────────────

const mockMedRepo = {
  create:      jest.fn(),
  findByCode:  jest.fn(),
  findByCodes: jest.fn(),
  findAll:     jest.fn(),
} as unknown as MedicationRepository;

// ── Fixtures ──────────────────────────────────────────────────────────────

const baseMedication = {
  code:      'AMX_500',
  name:      'Amoxicillin_500mg',
  weight:    50,
  imageUrl:  null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('MedicationService', () => {
  let service: MedicationService;

  beforeEach(() => {
    service = new MedicationService(mockMedRepo);
    jest.clearAllMocks();
  });

  // ── createMedication ─────────────────────────────────────────────────────

  describe('createMedication', () => {
    const input = { name: 'Amoxicillin_500mg', weight: 50, code: 'AMX_500' };

    it('creates and returns a new medication without an image', async () => {
      (mockMedRepo.create as jest.Mock).mockResolvedValue(baseMedication);

      const result = await service.createMedication(input);

      expect(result).toEqual(baseMedication);
      expect(mockMedRepo.create).toHaveBeenCalledWith({ ...input, imageUrl: undefined });
    });

    it('persists the imageUrl when provided', async () => {
      const withImage = { ...baseMedication, imageUrl: '/uploads/image.jpg' };
      (mockMedRepo.create as jest.Mock).mockResolvedValue(withImage);

      const result = await service.createMedication(input, '/uploads/image.jpg');

      expect(result.imageUrl).toBe('/uploads/image.jpg');
      expect(mockMedRepo.create).toHaveBeenCalledWith({ ...input, imageUrl: '/uploads/image.jpg' });
    });

    it('throws AppError 409 when the code already exists (Prisma P2002)', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      (mockMedRepo.create as jest.Mock).mockRejectedValue(prismaError);

      await expect(service.createMedication(input)).rejects.toThrow(AppError);
      await expect(service.createMedication(input)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('does not swallow unrelated errors', async () => {
      (mockMedRepo.create as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      await expect(service.createMedication(input)).rejects.toThrow('DB connection lost');
    });

    it('checks uniqueness on the code field — different name same code still throws', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      (mockMedRepo.create as jest.Mock).mockRejectedValue(prismaError);

      await expect(
        service.createMedication({ ...input, name: 'Different_Name' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ── getMedicationByCode ───────────────────────────────────────────────────

  describe('getMedicationByCode', () => {
    it('returns the medication when found', async () => {
      (mockMedRepo.findByCode as jest.Mock).mockResolvedValue(baseMedication);

      const result = await service.getMedicationByCode('AMX_500');

      expect(result).toEqual(baseMedication);
      expect(mockMedRepo.findByCode).toHaveBeenCalledWith('AMX_500');
    });

    it('throws AppError 404 if the medication is not found', async () => {
      (mockMedRepo.findByCode as jest.Mock).mockResolvedValue(null);

      await expect(service.getMedicationByCode('GHOST_CODE')).rejects.toThrow(AppError);
      await expect(service.getMedicationByCode('GHOST_CODE')).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});

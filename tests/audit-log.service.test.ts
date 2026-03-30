import { AuditLogService } from '../src/services/audit-log.service';
import { AuditLogRepository } from '../src/repositories/drone.repository';

// Prevent PrismaClient from initialising — repository is fully mocked
jest.mock('../src/config/database', () => ({ prisma: {} }));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// ── Repository mock ───────────────────────────────────────────────────────

const mockAuditRepo = {
  createMany:    jest.fn(),
  findPaginated: jest.fn(),
} as unknown as AuditLogRepository;

// ── Fixtures ──────────────────────────────────────────────────────────────

const pagination = { page: 1, limit: 20 };

const logs = [
  { id: 1, droneId: 'drone-uuid-1', serialNumber: 'DRN-TEST-001', batteryCapacity: 80, state: 'IDLE', createdAt: new Date() },
  { id: 2, droneId: 'drone-uuid-1', serialNumber: 'DRN-TEST-001', batteryCapacity: 79, state: 'IDLE', createdAt: new Date() },
];

const paginatedLogs = {
  data: logs,
  meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(() => {
    service = new AuditLogService(mockAuditRepo);
    jest.clearAllMocks();
  });

  describe('getAuditLogs', () => {
    it('returns paginated logs for all drones when no droneId is provided', async () => {
      (mockAuditRepo.findPaginated as jest.Mock).mockResolvedValue(paginatedLogs);

      const result = await service.getAuditLogs(pagination);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(mockAuditRepo.findPaginated).toHaveBeenCalledWith(pagination, undefined);
    });

    it('filters logs by droneId when provided', async () => {
      (mockAuditRepo.findPaginated as jest.Mock).mockResolvedValue(paginatedLogs);

      await service.getAuditLogs(pagination, 'drone-uuid-1');

      expect(mockAuditRepo.findPaginated).toHaveBeenCalledWith(pagination, 'drone-uuid-1');
    });

    it('returns empty data when no logs exist', async () => {
      (mockAuditRepo.findPaginated as jest.Mock).mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });

      const result = await service.getAuditLogs(pagination);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('respects page and limit from pagination input', async () => {
      (mockAuditRepo.findPaginated as jest.Mock).mockResolvedValue({
        data: [logs[0]],
        meta: { total: 2, page: 2, limit: 1, totalPages: 2 },
      });

      const result = await service.getAuditLogs({ page: 2, limit: 1 }, 'drone-uuid-1');

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(2);
    });
  });
});

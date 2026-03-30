import { BaseService } from './base.service';
import { PaginationInput } from '../validations';
import { AuditLogRepository, auditLogRepository } from '../repositories/drone.repository';
import { BatteryAuditLog } from '@prisma/client/index';
import { PaginatedResult } from '../types';

export class AuditLogService extends BaseService {
  constructor(private readonly auditLogsRepo: AuditLogRepository) {
    super();
  }

  /**
   * @method getAuditLogs
   * @async
   * @param {Required<PaginationInput>} pagination
   * @param {string} droneId 
   * @returns {Promise<any>}
   */
  async getAuditLogs(
    pagination: Required<PaginationInput>,
    droneId?: string
  ): Promise<PaginatedResult<BatteryAuditLog>> {
    return this.auditLogsRepo.findPaginated(pagination, droneId);
  }
}

export const auditLogService = new AuditLogService(
  auditLogRepository
);

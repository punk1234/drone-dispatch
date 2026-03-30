/**
 * @class BaseService
 *
 * Provides shared utility methods for all service classes.
 * Services extend this rather than duplicating common logic.
 */
export class BaseService {
  /**
   * Detects a Prisma unique constraint violation (P2002).
   * Used to convert DB-level errors into domain-level AppErrors.
   */
  isDatabaseUniqueConstraint(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}

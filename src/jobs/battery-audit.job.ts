import cron from 'node-cron';
import { logger } from '../utils/logger';
import { auditLogRepository, droneRepository } from '../repositories/drone.repository';
import { DroneState } from '../types';

const CRON_SCHEDULE = process.env.BATTERY_AUDIT_CRON || '* * * * *'; // every minute

export function startBatteryAuditJob(): void {
  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error(`Invalid cron schedule: ${CRON_SCHEDULE}`);
    return;
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      const drones = await droneRepository.findAll({
        select: {
          id: true,
          serialNumber: true,
          batteryCapacity: true,
          state: true,
        },
      });

      if (drones.length === 0) return;

      await auditLogRepository.createMany(drones.map(
        (drone: {
          id: string;
          serialNumber: string;
          batteryCapacity: number;
          state: string;
        }) => ({
          droneId: drone.id,
          serialNumber: drone.serialNumber,
          batteryCapacity: drone.batteryCapacity,
          state: <DroneState>drone.state,
        })),
      );

      logger.info(`[Battery Audit] Logged battery levels for ${drones.length} drone(s)`);

      // Warn about low-battery drones
      const lowBattery = drones.filter(
        (d: { batteryCapacity: number; serialNumber: string }) => d.batteryCapacity < 25
      );
      if (lowBattery.length > 0) {
        logger.warn(
          `[Battery Audit] Low battery drones: ${lowBattery.map((d: { serialNumber: string; batteryCapacity: number }) => `${d.serialNumber}(${d.batteryCapacity}%)`).join(', ')}`
        );
      }
    } catch (err) {
      logger.error('[Battery Audit] Job failed:', err);
    }
  });

  logger.info(`✅ Battery audit job scheduled: ${CRON_SCHEDULE}`);
}

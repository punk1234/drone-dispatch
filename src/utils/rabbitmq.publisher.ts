import { getRabbitChannel, EXCHANGE, DroneEvent, DroneRoutingKey } from '../config/rabbitmq';
import { logger } from './logger';

/**
 * Publishes a drone event to the drone.events topic exchange.
 *
 * The routing key (e.g. drone.state_changed) allows consumers to subscribe
 * selectively — a telemetry queue can bind to drone.* for all events, while
 * a billing queue binds only to drone.state_changed.
 *
 * Non-fatal: a publish failure is logged but never breaks the HTTP response.
 */
export async function publishDroneEvent(
  routingKey: DroneRoutingKey,
  droneId: string,
  serialNumber: string,
  payload: Record<string, unknown>
): Promise<void> {
  const event: DroneEvent = {
    eventType: routingKey,
    occurredAt: new Date().toISOString(),
    droneId,
    serialNumber,
    payload,
  };

  try {
    const channel = await getRabbitChannel();

    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
      persistent: true, // survive broker restart
      contentType: 'application/json',
      headers: { routingKey },
    });

    logger.info(`[RabbitMQ] Published ${routingKey} for drone ${serialNumber}`);
  } catch (err) {
    logger.error(`[RabbitMQ] Failed to publish ${routingKey} for drone ${serialNumber}:`, err);
  }
}

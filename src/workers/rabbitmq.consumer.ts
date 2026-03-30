import amqplib from 'amqplib';
import { EXCHANGE, ROUTING_KEYS, DroneEvent } from '../config/rabbitmq';
import { logger } from '../utils/logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

// Each queue represents a distinct downstream concern.
// In production these would be separate services consuming from the same exchange.
// Here they run in-process to demonstrate the full topic exchange routing pattern
// without adding a separate container. Extraction to a standalone service is
// straightforward — move this file to its own entrypoint and run independently.
const QUEUES = [
  { name: 'drone.telemetry', bindingKey: 'drone.*' }, // all events
  { name: 'drone.billing', bindingKey: ROUTING_KEYS.DRONE_STATE_CHANGED }, // state changes only
  { name: 'drone.audit', bindingKey: 'drone.*' }, // all events
] as const;

function processEvent(queueName: string, event: DroneEvent): void {
  switch (event.eventType) {
    case ROUTING_KEYS.DRONE_REGISTERED:
      logger.info(
        `[${queueName}] Drone registered — serial: ${event.serialNumber}, model: ${event.payload.model}`
      );
      break;

    case ROUTING_KEYS.DRONE_LOADED:
      logger.info(
        `[${queueName}] Drone loaded — serial: ${event.serialNumber}, totalWeight: ${event.payload.totalWeight}gr`
      );
      break;

    case ROUTING_KEYS.DRONE_STATE_CHANGED:
      logger.info(
        `[${queueName}] State change — serial: ${event.serialNumber}, ${event.payload.previousState} → ${event.payload.newState}`
      );
      if (event.payload.newState === 'DELIVERED') {
        logger.info(
          `[${queueName}] Delivery confirmed for ${event.serialNumber} — post-delivery workflow triggered`
        );
      }
      break;
  }
}

/**
 * Starts the RabbitMQ event consumer in-process alongside the API.
 * Non-fatal — a consumer startup failure is logged but never crashes the server.
 *
 * Production note: extract this to a standalone service for independent scaling.
 * The exchange/queue contract remains identical — only the entrypoint changes.
 */
export async function startDroneEventConsumer(): Promise<void> {
  try {
    const connection = await amqplib.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    for (const { name, bindingKey } of QUEUES) {
      await channel.assertQueue(name, { durable: true });
      await channel.bindQueue(name, EXCHANGE, bindingKey);

      await channel.consume(name, (msg) => {
        if (!msg) return;
        try {
          const event: DroneEvent = JSON.parse(msg.content.toString());
          processEvent(name, event);
          channel.ack(msg);
        } catch (err) {
          logger.error(`[${name}] Failed to process message:`, err);
          channel.nack(msg, false, false); // reject without requeue — dead-letter in production
        }
      });

      logger.info(`✅ RabbitMQ consumer listening — queue: ${name} (binding: ${bindingKey})`);
    }
  } catch (err) {
    logger.error('RabbitMQ consumer failed to start (non-fatal):', err);
  }
}

import amqplib, { ChannelModel, Channel } from 'amqplib';
import { logger } from '../utils/logger';

// ── Exchange & routing key definitions ────────────────────────────────────

export const EXCHANGE = 'drone.events';

export const ROUTING_KEYS = {
  DRONE_REGISTERED: 'drone.registered',
  DRONE_LOADED: 'drone.loaded',
  DRONE_STATE_CHANGED: 'drone.state_changed',
} as const;

export type DroneRoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

// ── Event envelope ────────────────────────────────────────────────────────

export interface DroneEvent {
  eventType: DroneRoutingKey;
  occurredAt: string;
  droneId: string;
  serialNumber: string;
  payload: Record<string, unknown>;
}

// ── Connection + channel singleton ────────────────────────────────────────

let channelModel: ChannelModel | null = null;
let channel: Channel | null = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

export async function getRabbitChannel(): Promise<Channel> {
  if (channel) return channel;

  channelModel = await amqplib.connect(RABBITMQ_URL);
  channel = await channelModel.createChannel();

  // Durable topic exchange — survives broker restarts.
  // Consumers bind queues with routing key patterns (e.g. drone.* for all events).
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

  logger.info('✅ RabbitMQ channel ready');
  return channel;
}

export async function disconnectRabbit(): Promise<void> {
  try {
    await channel?.close();
    await channelModel?.close();
    channel = null;
    channelModel = null;
    logger.info('RabbitMQ disconnected');
  } catch {
    // Ignore errors during shutdown
  }
}

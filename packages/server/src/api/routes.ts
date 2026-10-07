import type { FastifyInstance } from 'fastify';
import { GameEngine } from '../game/engine';
import { createChildLogger } from '../logger';

const logger = createChildLogger('api');

export async function registerRoutes(
  fastify: FastifyInstance,
  engine: GameEngine
): Promise<void> {
  // Health check
  fastify.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // Readiness check
  fastify.get('/readyz', async (_request, reply) => {
    const metrics = engine.getTotalMetrics();
    return reply.status(200).send({
      status: 'ready',
      timestamp: Date.now(),
      metrics,
    });
  });

  // Metrics endpoint
  fastify.get('/api/metrics', async (_request, reply) => {
    const metrics = engine.getTotalMetrics();
    return reply.status(200).send({
      timestamp: Date.now(),
      ...metrics,
    });
  });

  // Rooms list (admin)
  fastify.get('/api/admin/rooms', async (_request, reply) => {
    const rooms = engine.getRooms();
    return reply.status(200).send({
      rooms: rooms.map(room => ({
        id: room.id,
        createdAt: room.createdAt,
        snakeCount: room.snakes.size,
        humanCount: room.getHumanCount(),
        botCount: room.bots.size,
        foodCount: room.food.size,
        isActive: room.isActive(),
      })),
    });
  });

  logger.info('REST routes registered');
}

import type { FastifyInstance } from 'fastify';
import type { GameEngine } from '../game/engine.js';
import type { GameSocketServer } from '../ws/index.js';

export async function registerRoutes(
  fastify: FastifyInstance,
  engine: GameEngine,
  sockets: GameSocketServer
): Promise<void> {
  fastify.get('/healthz', async () => ({ status: 'ok' }));

  fastify.get('/readyz', async () => ({ status: 'ready', timestamp: Date.now(), metrics: engine.getTotalMetrics() }));

  fastify.get('/api/metrics', async (_request, reply) => {
    const mem = process.memoryUsage();
    reply.header('Cache-Control', 'no-store');
    return {
      timestamp: Date.now(),
      connections: sockets.connectionCount,
      rssMB: Math.round(mem.rss / 1048576),
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      ...engine.getTotalMetrics(),
    };
  });

  fastify.get('/api/rooms', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return {
      rooms: engine.getRooms().map((room) => ({
        id: room.id,
        createdAt: room.createdAt,
        humans: room.humanCount(),
        bots: room.botCount(),
        food: room.food.size,
      })),
    };
  });
}

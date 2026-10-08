import type { FastifyInstance } from 'fastify';
import type { GameEngine } from '../game/engine.js';
import type { GameSocketServer } from '../ws/index.js';
import { timingSafeEqual } from 'crypto';
import { settings } from '../settings.js';
import { stats } from '../stats.js';

const POSTBACK_NEGATIVE = new Set(['not_valued', 'non_valued', 'notvalued', 'no', 'false', '0']);

export async function registerRoutes(
  fastify: FastifyInstance,
  engine: GameEngine,
  sockets: GameSocketServer
): Promise<void> {
  fastify.get('/healthz', async () => ({ status: 'ok' }));

  /**
   * Monetag postback for Telegram Mini App ads. Configure it in Monetag as
   * /api/monetag/postback?secret=…&ymid={ymid}&event={reward_event_type}&price={estimated_price}
   */
  fastify.get('/api/monetag/postback', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const expected = settings().ads.postbackSecret;
    const given = String(q.secret ?? '');
    const ok = expected.length > 0 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) return reply.code(403).send({ ok: false });
    const event = String(q.event ?? q.reward_event_type ?? 'valued').toLowerCase();
    const valued = !POSTBACK_NEGATIVE.has(event);
    const price = Number(q.price ?? q.estimated_price ?? 0);
    stats.inc('ad_impression', 'telegram');
    if (Number.isFinite(price) && price > 0 && price < 1000) stats.inc('ad_revenue_micro', 'telegram', Math.round(price * 1_000_000));
    const ymid = String(q.ymid ?? '');
    const matched = valued && ymid ? sockets.confirmRevivePostback(ymid) : false;
    return { ok: true, matched };
  });

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

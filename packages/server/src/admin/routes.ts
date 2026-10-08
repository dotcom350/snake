import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, type SettingsSection } from '@snake/shared';
import { query } from '../db/index.js';
import { config } from '../config.js';
import { settings, saveSection, gameConfig } from '../settings.js';
import { stats } from '../stats.js';
import type { GameEngine } from '../game/engine.js';
import type { GameSocketServer } from '../ws/index.js';
import { adminExists, audit, bearer, changePassword, login, loginBlocked, logout, requireAdmin } from './auth.js';

const LoginSchema = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200) });
const PasswordSchema = z.object({ current: z.string().min(1).max(200), next: z.string().min(10).max(200) });

const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const ascii = (start: number, len: number) => buf.subarray(start, start + len).toString('latin1');
  return (
    (buf[0] === 0x89 && ascii(1, 3) === 'PNG') ||
    (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') ||
    ascii(0, 4) === 'GIF8'
  );
}

function looksLikeAudio(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const ascii = (start: number, len: number) => buf.subarray(start, start + len).toString('latin1');
  return (
    ascii(0, 3) === 'ID3' ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) ||
    ascii(0, 4) === 'OggS' ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') ||
    ascii(4, 4) === 'ftyp'
  );
}

export async function registerAdminRoutes(
  fastify: FastifyInstance,
  deps: { engine: GameEngine; sockets: GameSocketServer; uploadsDir: string }
): Promise<void> {
  const { engine, sockets, uploadsDir } = deps;
  const startedAt = Date.now();

  fastify.get('/api/admin/status', async () => ({ adminExists: await adminExists() }));

  fastify.post('/api/admin/login', async (request, reply) => {
    if (loginBlocked(request.ip)) return reply.code(429).send({ error: 'TOO_MANY_ATTEMPTS' });
    const body = LoginSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const result = await login(body.data.email, body.data.password, request.ip);
    if (!result) return reply.code(401).send({ error: 'AUTH_FAILED' });
    await audit(result.admin.id, 'login', 'admin', undefined, request.ip);
    return { token: result.token, email: result.admin.email };
  });

  await fastify.register(async (app) => {
    app.addHook('preHandler', requireAdmin);
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store');
      return payload;
    });

    app.addContentTypeParser([...Object.keys(AUDIO_TYPES), ...Object.keys(IMAGE_TYPES)], { parseAs: 'buffer', bodyLimit: 12 * 1024 * 1024 }, (_req, body, done) =>
      done(null, body)
    );

    app.post('/api/admin/logout', async (request) => {
      const token = bearer(request);
      if (token) await logout(token);
      return { ok: true };
    });

    app.get('/api/admin/me', async (request) => ({ email: request.admin!.email }));

    app.post('/api/admin/password', async (request, reply) => {
      const body = PasswordSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'PASSWORD_TOO_SHORT' });
      const ok = await changePassword(request.admin!.id, body.data.current, body.data.next, bearer(request)!);
      if (!ok) return reply.code(403).send({ error: 'AUTH_FAILED' });
      await audit(request.admin!.id, 'change_password', 'admin', undefined, request.ip);
      return { ok: true };
    });

    app.get('/api/admin/live', async () => {
      const mem = process.memoryUsage();
      const g = gameConfig();
      return {
        now: Date.now(),
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        connections: sockets.connectionCount,
        ...engine.getTotalMetrics(),
        memory: { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) },
        profile: config.resourceConfig.profile,
        limits: {
          tickHz: config.resourceConfig.tickHz,
          maxRooms: config.resourceConfig.maxRooms,
          connectionLimit: config.resourceConfig.connectionLimit,
          playersPerRoom: g.playersPerRoom,
          botsPerRoom: g.botsPerRoom,
          arenaSize: g.arenaSize,
          foodPerRoom: g.foodPerRoom,
        },
        rooms: engine.getRooms().map((r) => ({
          id: r.id.slice(0, 8),
          humans: r.humanCount(),
          bots: r.botCount(),
          food: r.food.size,
          size: r.width,
          ageSec: Math.round((Date.now() - r.createdAt) / 1000),
          top: r.leaderboard().slice(0, 3).map((s) => ({ name: s.nickname, score: Math.floor(s.mass), bot: s.isBot })),
        })),
      };
    });

    app.get('/api/admin/stats', async (request) => {
      await stats.flush();
      const days = Math.min(365, Math.max(1, Number((request.query as { days?: string }).days) || 30));
      const today = stats.day();
      const fromDate = new Date(`${today}T00:00:00Z`);
      fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
      const from = fromDate.toISOString().slice(0, 10);
      const tz = settings().general.timeZone;

      const [series, uniques, breakdown, games, samples, topToday, topAll] = await Promise.all([
        query<{ day: string; metric: string; value: string }>(
          `SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, sum(value)::text AS value FROM stats_daily
           WHERE day >= $1 AND metric IN ('pageview','game_start','death','kill','playtime_sec','max_players','ad_impression','connections')
           GROUP BY day, metric`,
          [from]
        ),
        query<{ day: string; kind: string; n: string }>(
          `SELECT to_char(day, 'YYYY-MM-DD') AS day, kind, count(*)::text AS n FROM stats_uniques WHERE day >= $1 GROUP BY day, kind`,
          [from]
        ),
        query<{ metric: string; key: string; value: string }>(
          `SELECT metric, key, sum(value)::text AS value FROM stats_daily
           WHERE day >= $1 AND metric IN ('pageview','game_start','game_lang','skin','death','referrer','crawler','ad_impression','device_visit')
           GROUP BY metric, key ORDER BY sum(value) DESC`,
          [from]
        ),
        query<{ n: string; avg_sec: string; avg_score: string; max_score: string }>(
          `SELECT count(*)::text AS n, coalesce(avg(extract(epoch FROM ended_at - started_at)), 0)::text AS avg_sec,
                  coalesce(avg(score), 0)::text AS avg_score, coalesce(max(score), 0)::text AS max_score
           FROM games WHERE (ended_at AT TIME ZONE $2)::date >= $1::date`,
          [from, tz]
        ),
        query<{ hour: string; avg_players: string; max_players: string; avg_rss: string; avg_tick: string; max_conn: string }>(
          `SELECT to_char(date_trunc('hour', ts AT TIME ZONE $1), 'YYYY-MM-DD"T"HH24') AS hour,
                  avg(players)::text AS avg_players, max(players)::text AS max_players,
                  avg(rss_mb)::text AS avg_rss, avg(tick_ms)::text AS avg_tick, max(connections)::text AS max_conn
           FROM stats_samples WHERE ts > now() - interval '48 hours' GROUP BY 1 ORDER BY 1`,
          [tz]
        ),
        query(
          `SELECT nickname, score, kills, skin, device, ended_at FROM games
           WHERE (ended_at AT TIME ZONE $2)::date = $1::date ORDER BY score DESC LIMIT 10`,
          [today, tz]
        ),
        query(`SELECT nickname, score, kills, skin, device, ended_at FROM games ORDER BY score DESC LIMIT 10`),
      ]);

      return { today, from, days, timeZone: tz, series, uniques, breakdown, games: games[0], samples, topToday, topAll };
    });

    app.get('/api/admin/settings', async () => ({ settings: settings(), defaults: DEFAULT_SETTINGS }));

    app.put('/api/admin/settings/:section', async (request, reply) => {
      const section = (request.params as { section: string }).section as SettingsSection;
      if (!(section in SETTINGS_SCHEMAS)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const result = await saveSection(section, request.body, request.admin!.id);
      if (!result.ok) return reply.code(400).send({ error: 'INVALID_INPUT', issues: result.issues });
      await audit(request.admin!.id, 'update_settings', section, section === 'ads' ? { enabled: settings().ads.enabled } : request.body, request.ip);
      return { ok: true, settings: settings() };
    });

    app.post('/api/admin/music', async (request, reply) => {
      const type = String(request.headers['content-type'] ?? '').split(';')[0].trim();
      const ext = AUDIO_TYPES[type];
      const body = request.body as Buffer;
      if (!ext || !Buffer.isBuffer(body) || !looksLikeAudio(body)) return reply.code(400).send({ error: 'INVALID_AUDIO' });
      await fs.mkdir(uploadsDir, { recursive: true });
      const name = `music-${randomBytes(8).toString('hex')}.${ext}`;
      await fs.writeFile(path.join(uploadsDir, name), body);

      const previous = settings().sound.customMusicUrl;
      await saveSection('sound', { ...settings().sound, customMusicUrl: `/uploads/${name}` }, request.admin!.id);
      if (previous?.startsWith('/uploads/music-')) await fs.rm(path.join(uploadsDir, path.basename(previous)), { force: true });
      await audit(request.admin!.id, 'upload_music', 'sound', { file: name, bytes: body.length }, request.ip);
      return { ok: true, settings: settings() };
    });

    app.delete('/api/admin/music', async (request) => {
      const previous = settings().sound.customMusicUrl;
      await saveSection('sound', { ...settings().sound, customMusicUrl: null }, request.admin!.id);
      if (previous?.startsWith('/uploads/music-')) await fs.rm(path.join(uploadsDir, path.basename(previous)), { force: true });
      await audit(request.admin!.id, 'delete_music', 'sound', undefined, request.ip);
      return { ok: true, settings: settings() };
    });

    app.post('/api/admin/background', async (request, reply) => {
      const type = String(request.headers['content-type'] ?? '').split(';')[0].trim();
      const ext = IMAGE_TYPES[type];
      const body = request.body as Buffer;
      if (!ext || !Buffer.isBuffer(body) || body.length > 5 * 1024 * 1024 || !looksLikeImage(body)) {
        return reply.code(400).send({ error: 'INVALID_IMAGE' });
      }
      await fs.mkdir(uploadsDir, { recursive: true });
      const name = `bg-${randomBytes(8).toString('hex')}.${ext}`;
      await fs.writeFile(path.join(uploadsDir, name), body);
      const previous = settings().appearance.bgImageUrl;
      const result = await saveSection('appearance', { ...settings().appearance, bgImageUrl: `/uploads/${name}` }, request.admin!.id);
      if (!result.ok) return reply.code(400).send({ error: 'INVALID_INPUT', issues: result.issues });
      if (previous?.startsWith('/uploads/bg-')) await fs.rm(path.join(uploadsDir, path.basename(previous)), { force: true });
      await audit(request.admin!.id, 'upload_background', 'appearance', { file: name, bytes: body.length }, request.ip);
      return { ok: true, settings: settings() };
    });

    app.delete('/api/admin/background', async (request) => {
      const previous = settings().appearance.bgImageUrl;
      await saveSection('appearance', { ...settings().appearance, bgImageUrl: null }, request.admin!.id);
      if (previous?.startsWith('/uploads/bg-')) await fs.rm(path.join(uploadsDir, path.basename(previous)), { force: true });
      await audit(request.admin!.id, 'delete_background', 'appearance', undefined, request.ip);
      return { ok: true, settings: settings() };
    });

    app.get('/api/admin/audit', async () =>
      query(
        `SELECT l.action, l.resource, l.ip_address AS ip, l.created_at AS at, a.email
         FROM audit_logs l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 100`
      )
    );
  });
}

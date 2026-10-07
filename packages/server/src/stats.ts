import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { query } from './db/index.js';
import { settings, internalSecret } from './settings.js';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('stats');

export interface GameRecord {
  startedAt: number;
  endedAt: number;
  nickname: string;
  score: number;
  kills: number;
  reason: 'snake' | 'wall' | 'quit';
  device: 'm' | 'd';
  lang: 'en' | 'es';
  skin: number;
}

const CRAWLERS: Array<[RegExp, string]> = [
  [/googlebot|google-inspectiontool|storebot-google/i, 'Google'],
  [/bingbot/i, 'Bing'],
  [/yandex/i, 'Yandex'],
  [/duckduckbot/i, 'DuckDuckGo'],
  [/baiduspider/i, 'Baidu'],
  [/applebot/i, 'Apple'],
  [/facebookexternalhit|facebot/i, 'Facebook'],
  [/twitterbot/i, 'Twitter/X'],
  [/whatsapp/i, 'WhatsApp'],
  [/telegrambot/i, 'Telegram'],
  [/discordbot/i, 'Discord'],
  [/slackbot/i, 'Slack'],
  [/linkedinbot/i, 'LinkedIn'],
  [/gptbot|chatgpt|oai-searchbot/i, 'OpenAI'],
  [/claudebot|claude-web|anthropic/i, 'Anthropic'],
  [/perplexitybot/i, 'Perplexity'],
  [/ahrefs|semrush|mj12bot|dotbot|petalbot/i, 'SEO tools'],
  [/bot|crawl|spider|slurp|preview|fetch|monitor|uptime|headless|curl|wget|python|go-http/i, 'Other bots'],
];

function hash16(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

class StatsCollector {
  private counters = new Map<string, number>();
  private uniques = new Set<string>();
  private games: GameRecord[] = [];
  private secret = '';
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private flushing: Promise<void> | null = null;

  async init(): Promise<void> {
    this.secret = await internalSecret();
    this.timers.push(setInterval(() => void this.flush(), 60_000));
    this.timers.push(setInterval(() => void this.cleanup(), 6 * 3600_000));
    void this.cleanup();
  }

  day(ts = Date.now()): string {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: settings().general.timeZone }).format(ts);
    } catch {
      return new Date(ts).toISOString().slice(0, 10);
    }
  }

  inc(metric: string, key = '', n = 1): void {
    const k = `${this.day()}|${metric}|${key.slice(0, 120)}`;
    this.counters.set(k, (this.counters.get(k) ?? 0) + n);
  }

  /** Metrics prefixed max_ keep the highest value seen per day. */
  max(metric: string, value: number): void {
    const k = `${this.day()}|max_${metric}|`;
    if (value > (this.counters.get(k) ?? -Infinity)) this.counters.set(k, value);
  }

  unique(kind: 'player' | 'visitor', raw: string): void {
    const day = this.day();
    this.uniques.add(`${day}|${kind}|${hash16(`${day}|${this.secret}|${raw}`)}`);
  }

  game(record: GameRecord): void {
    this.games.push(record);
    this.inc('death', record.reason);
    this.inc('playtime_sec', '', Math.max(0, Math.round((record.endedAt - record.startedAt) / 1000)));
    if (this.games.length > 5000) void this.flush();
  }

  pageview(request: FastifyRequest, page: string): void {
    const ua = String(request.headers['user-agent'] ?? '');
    const crawler = CRAWLERS.find(([re]) => re.test(ua));
    if (crawler || !ua) {
      this.inc('crawler', crawler ? crawler[1] : 'No user agent');
      return;
    }
    this.inc('pageview', page);
    this.unique('visitor', `${request.ip}|${ua}`);
    this.inc('device_visit', /mobile|android|iphone|ipad/i.test(ua) ? 'm' : 'd');

    const ref = String(request.headers.referer ?? '');
    if (ref) {
      try {
        const host = new URL(ref).hostname.replace(/^www\./, '');
        const own = String(request.headers.host ?? '').split(':')[0].replace(/^www\./, '');
        if (host && host !== own) this.inc('referrer', host);
      } catch {
        // Ignore malformed referrers.
      }
    } else {
      this.inc('referrer', '(direct)');
    }
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    const counters = this.counters;
    const uniques = this.uniques;
    const games = this.games;
    this.counters = new Map();
    this.uniques = new Set();
    this.games = [];

    try {
      if (counters.size) {
        const days: string[] = [], metrics: string[] = [], keys: string[] = [], values: number[] = [];
        for (const [k, v] of counters) {
          const [day, metric, key] = k.split('|');
          days.push(day);
          metrics.push(metric);
          keys.push(key);
          values.push(Math.round(v));
        }
        await query(
          `INSERT INTO stats_daily (day, metric, key, value)
           SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::bigint[])
           ON CONFLICT (day, metric, key) DO UPDATE SET value = CASE
             WHEN stats_daily.metric LIKE 'max\\_%' THEN GREATEST(stats_daily.value, EXCLUDED.value)
             ELSE stats_daily.value + EXCLUDED.value END`,
          [days, metrics, keys, values]
        );
      }
      if (uniques.size) {
        const days: string[] = [], kinds: string[] = [], hashes: string[] = [];
        for (const u of uniques) {
          const [day, kind, hash] = u.split('|');
          days.push(day);
          kinds.push(kind);
          hashes.push(hash);
        }
        await query(
          `INSERT INTO stats_uniques (day, kind, hash)
           SELECT * FROM unnest($1::date[], $2::text[], $3::text[]) ON CONFLICT DO NOTHING`,
          [days, kinds, hashes]
        );
      }
      if (games.length) {
        await query(
          `INSERT INTO games (started_at, ended_at, nickname, score, kills, reason, device, lang, skin)
           SELECT to_timestamp(s / 1000.0), to_timestamp(e / 1000.0), n, sc, k, r, d, l, sk
           FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::int[], $5::int[], $6::text[], $7::text[], $8::text[], $9::int[])
             AS t(s, e, n, sc, k, r, d, l, sk)`,
          [
            games.map((g) => g.startedAt),
            games.map((g) => g.endedAt),
            games.map((g) => g.nickname),
            games.map((g) => g.score),
            games.map((g) => g.kills),
            games.map((g) => g.reason),
            games.map((g) => g.device),
            games.map((g) => g.lang),
            games.map((g) => g.skin),
          ]
        );
      }
    } catch (err) {
      logger.error({ err }, 'Stats flush failed');
    }
  }

  async sample(s: { players: number; bots: number; rooms: number; connections: number; rssMb: number; tickMs: number }) {
    try {
      await query(
        `INSERT INTO stats_samples (ts, players, bots, rooms, connections, rss_mb, tick_ms)
         VALUES (date_trunc('minute', now()), $1, $2, $3, $4, $5, $6) ON CONFLICT (ts) DO NOTHING`,
        [s.players, s.bots, s.rooms, s.connections, s.rssMb, s.tickMs]
      );
    } catch (err) {
      logger.error({ err }, 'Sample insert failed');
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await query("DELETE FROM stats_samples WHERE ts < now() - interval '30 days'");
      await query("DELETE FROM stats_uniques WHERE day < current_date - 120");
      await query("DELETE FROM games WHERE ended_at < now() - interval '365 days'");
      await query('DELETE FROM admin_sessions WHERE expires_at < now()');
    } catch (err) {
      logger.error({ err }, 'Stats cleanup failed');
    }
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    await this.flush();
  }
}

export const stats = new StatsCollector();

import { z } from 'zod';
import os from 'os';
import { getResourceConfig, mergeResourceConfig } from '@snake/shared';
import type { ResourceConfig, ResourceProfile } from '@snake/shared';

const EnvSchema = z.object({
  // Database
  DATABASE_URL: z.url(),

  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('production'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().default(3000),
  WS_PATH: z.string().default('/ws'),

  // Resource Profile
  RESOURCE_PROFILE: z
    .enum(['auto', 'low', 'standard', 'high'])
    .default('auto'),

  // Memory
  NODE_HEAP_MB: z.coerce.number().int().default(256),
  APP_MEM_LIMIT: z.string().default('448m'),
  DB_MEM_LIMIT: z.string().default('256m'),

  // Game Settings (optional overrides)
  TICK_HZ: z.coerce.number().int().optional(),
  ROOM_CAPACITY: z.coerce.number().int().optional(),
  MAX_ROOMS: z.coerce.number().int().optional(),
  BOT_ENABLE: z.enum(['true', 'false']).transform(v => v === 'true').default(true),
  BOT_MIN_PER_ROOM: z.coerce.number().int().optional(),
  ARENA_WIDTH: z.coerce.number().int().optional(),
  ARENA_HEIGHT: z.coerce.number().int().optional(),

  // Boost & Revival
  BOOST_CONSUMPTION: z.coerce.number().optional(),
  BOOST_MIN_LENGTH: z.coerce.number().int().optional(),
  REVIVAL_PROTECTION_DURATION: z.coerce.number().int().optional(),
  REVIVAL_RESTORE_PERCENT: z.coerce.number().int().optional(),
  REVIVAL_MAX_PER_RUN: z.coerce.number().int().optional(),
  REVIVAL_CLAIM_EXPIRY: z.coerce.number().int().optional(),

  // Admin
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
  ADMIN_RATE_LIMIT_ATTEMPTS: z.coerce.number().int().default(5),
  ADMIN_RATE_LIMIT_WINDOW: z.coerce.number().int().default(300),

  // Advertising
  AD_ENABLE: z.enum(['true', 'false']).transform(v => v === 'true').default(false),
  AD_MONETAG_SCRIPT_URL: z.string().optional(),
  AD_REWARD_ZONE_ID: z.string().optional(),
  AD_FREQUENCY_CAP_DAILY: z.coerce.number().int().default(3),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // Metrics
  METRICS_SAMPLE_INTERVAL: z.coerce.number().int().default(15),
  EVENT_RETENTION_DAYS: z.coerce.number().int().default(30),

  // SSL/TLS
  SSL_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default(false),
  // Public URL used for canonical/hreflang/sitemap links, e.g. https://snake.example.com
  SITE_URL: z.url().optional(),
  // Persistent files (uploaded music). Mount a volume here in production.
  DATA_DIR: z.string().default('./data'),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedConfig: Config | null = null;

export class Config {
  env: Env;
  resourceConfig: ResourceConfig;

  constructor(env: Partial<Env> = process.env as Partial<Env>) {
    const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '' && v !== undefined));
    const parsed = EnvSchema.parse(cleaned);
    this.env = parsed;

    const baseProfile = getResourceConfig(
      parsed.RESOURCE_PROFILE as ResourceProfile,
      detectHost()
    );

    const overrides: Partial<typeof baseProfile> = {};
    if (parsed.TICK_HZ) overrides.tickHz = parsed.TICK_HZ;
    if (parsed.ROOM_CAPACITY) overrides.roomCapacity = parsed.ROOM_CAPACITY;
    if (parsed.MAX_ROOMS) overrides.maxRooms = parsed.MAX_ROOMS;
    if (parsed.BOT_MIN_PER_ROOM)
      overrides.botMinPerRoom = parsed.BOT_MIN_PER_ROOM;
    if (parsed.ARENA_WIDTH) overrides.arenaWidth = parsed.ARENA_WIDTH;
    if (parsed.ARENA_HEIGHT) overrides.arenaHeight = parsed.ARENA_HEIGHT;

    this.resourceConfig = mergeResourceConfig(baseProfile, overrides);
  }

  static getInstance(): Config {
    if (!cachedConfig) {
      cachedConfig = new Config();
    }
    return cachedConfig;
  }

  get isDev(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

}

export const config = Config.getInstance();

function detectHost() {
  const total = os.totalmem();
  const constrained = process.constrainedMemory?.() ?? 0;
  return {
    cpuCount: os.availableParallelism(),
    memoryBytes: constrained > 0 && constrained < total ? constrained : total,
  };
}

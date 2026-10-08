import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, type AllSettings, type SettingsSection } from '@snake/shared';
import { query } from './db/index.js';
import { config } from './config.js';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('settings');
const SECTIONS = Object.keys(SETTINGS_SCHEMAS) as SettingsSection[];

let current: AllSettings = structuredClone(DEFAULT_SETTINGS);
let version = 1;

function parseSection<K extends SettingsSection>(section: K, value: unknown): AllSettings[K] | null {
  const merged =
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...DEFAULT_SETTINGS[section], ...(value as object) }
      : value;
  const result = SETTINGS_SCHEMAS[section].safeParse(merged);
  if (!result.success) return null;
  const data = result.data as AllSettings[K];
  if (section === 'sound') {
    const sound = data as AllSettings['sound'];
    if (sound.customMusicUrl && !sound.tracks.some((tr) => tr.url === sound.customMusicUrl)) {
      sound.tracks = [{ url: sound.customMusicUrl, name: 'Music' }, ...sound.tracks];
    }
  }
  return data;
}

export async function loadSettings(): Promise<void> {
  const rows = await query<{ key: string; value: unknown }>(
    'SELECT key, value FROM app_settings WHERE key = ANY($1)',
    [SECTIONS.map((s) => `settings.${s}`)]
  );
  for (const row of rows) {
    const section = row.key.slice('settings.'.length) as SettingsSection;
    const parsed = parseSection(section, row.value);
    if (parsed) (current as unknown as Record<string, unknown>)[section] = parsed;
    else logger.warn({ section }, 'Stored settings are invalid; using defaults');
  }
  version++;
}

/** Makes sure values the server owns (like the postback secret) exist. */
export async function ensureGeneratedSettings(): Promise<void> {
  if (current.ads.postbackSecret) return;
  const { randomBytes } = await import('crypto');
  const ads = { ...current.ads, postbackSecret: randomBytes(18).toString('base64url') };
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('settings.ads', $1, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(ads)]
  );
  current = { ...current, ads };
  version++;
}

export function settings(): AllSettings {
  return current;
}

export function settingsVersion(): number {
  return version;
}

export type SaveResult = { ok: true } | { ok: false; issues: string[] };

export async function saveSection(section: SettingsSection, value: unknown, adminId: string): Promise<SaveResult> {
  const result = SETTINGS_SCHEMAS[section].safeParse(value);
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.') || section}: ${i.message}`) };
  }
  await query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [`settings.${section}`, JSON.stringify(result.data), adminId]
  );
  current = { ...current, [section]: result.data };
  version++;
  return { ok: true };
}

export async function internalSecret(): Promise<string> {
  const row = await query<{ value: string }>("SELECT value #>> '{}' AS value FROM app_settings WHERE key = 'internal.secret'");
  if (row[0]?.value) return row[0].value;
  const secret = (await import('crypto')).randomBytes(32).toString('hex');
  await query("INSERT INTO app_settings (key, value) VALUES ('internal.secret', to_jsonb($1::text)) ON CONFLICT (key) DO NOTHING", [secret]);
  const again = await query<{ value: string }>("SELECT value #>> '{}' AS value FROM app_settings WHERE key = 'internal.secret'");
  return again[0].value;
}

/** Admin overrides on top of the automatic resource profile. */
export function gameConfig() {
  const g = current.game;
  const rc = config.resourceConfig;
  return {
    arenaSize: g.arenaSize ?? rc.arenaWidth,
    playersPerRoom: g.playersPerRoom ?? rc.roomCapacity,
    botsPerRoom: g.botsPerRoom ?? rc.botMinPerRoom,
    foodPerRoom: g.foodPerRoom ?? rc.maxFoodPerRoom,
    speed: g.speed,
    boostSpeed: g.boostSpeed,
    boostCost: g.boostCost,
    startMass: g.startMass,
    spawnProtectionMs: g.spawnProtectionSec * 1000,
    growth: g.growth,
  };
}

export function enabledSkinIds(): number[] {
  const ids: number[] = [];
  current.appearance.skins.forEach((s, i) => {
    if (s.enabled) ids.push(i);
  });
  return ids.length ? ids : [0];
}

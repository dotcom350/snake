import { z } from 'zod';

import {
  SKIN_PATTERNS,
  HEAD_SHAPES,
  BG_PATTERNS,
  MUSIC_STYLES,
  MAX_SKINS,
  type Appearance,
  type SkinDef,
  type SoundSettings,
  type GameSettings,
  type AdSettings,
  type GeneralSettings,
} from './site-config.js';
export type { SettingsSection } from './site-config.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SkinSchema: z.ZodType<SkinDef> = z.object({
  name: z.string().trim().min(1).max(24),
  pattern: z.enum(SKIN_PATTERNS),
  head: z.enum(HEAD_SHAPES),
  colors: z.array(hex).min(1).max(6),
  glow: z.boolean(),
  enabled: z.boolean(),
});

export const AppearanceSchema: z.ZodType<Appearance> = z.object({
  background: hex,
  bgPattern: z.enum(BG_PATTERNS),
  patternColor: hex,
  patternOpacity: z.number().min(0).max(1),
  outside: hex,
  border: hex,
  foodGlow: z.number().min(0).max(1),
  foodColors: z.array(hex).min(1).max(16),
  landingAccent: hex,
  landingAccent2: hex,
  landingBackground: hex,
  skins: z.array(SkinSchema).min(1).max(MAX_SKINS),
});

export const SoundSchema: z.ZodType<SoundSettings> = z.object({
  enabled: z.boolean(),
  musicStyle: z.enum(MUSIC_STYLES),
  musicVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
  customMusicUrl: z.string().max(200).nullable(),
});

/** null = use the value from the server's resource profile. */
export const GameSettingsSchema: z.ZodType<GameSettings> = z.object({
  arenaSize: z.number().int().min(1000).max(10000).nullable(),
  playersPerRoom: z.number().int().min(2).max(100).nullable(),
  botsPerRoom: z.number().int().min(0).max(50).nullable(),
  foodPerRoom: z.number().int().min(50).max(2000).nullable(),
  speed: z.number().min(60).max(400),
  boostSpeed: z.number().min(100).max(800),
  boostCost: z.number().min(0).max(40),
  startMass: z.number().min(5).max(200),
  spawnProtectionSec: z.number().min(0).max(10),
});

export const AdsSchema: z.ZodType<AdSettings> = z.object({
  enabled: z.boolean(),
  headCode: z.string().max(20000),
  landingCode: z.string().max(20000),
  deathCode: z.string().max(20000),
  deathEvery: z.number().int().min(1).max(20),
  adsTxt: z.string().max(20000),
});

export const GeneralSchema: z.ZodType<GeneralSettings> = z.object({
  timeZone: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
});

export const SETTINGS_SCHEMAS = {
  appearance: AppearanceSchema,
  sound: SoundSchema,
  game: GameSettingsSchema,
  ads: AdsSchema,
  general: GeneralSchema,
} as const;


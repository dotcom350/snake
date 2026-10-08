import { z } from 'zod';

import {
  SKIN_PATTERNS,
  HEAD_SHAPES,
  EYE_STYLES,
  ACCESSORIES,
  BG_PATTERNS,
  BG_GRADIENTS,
  PARTICLES,
  BG_IMAGE_MODES,
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
  eyes: z.enum(EYE_STYLES).optional(),
  eyeColor: hex.optional(),
  accessory: z.enum(ACCESSORIES).optional(),
  patternScale: z.number().min(0.3).max(3).optional(),
  shine: z.number().min(0).max(1).optional(),
});

export const AppearanceSchema: z.ZodType<Appearance> = z.object({
  background: hex,
  bgPattern: z.enum(BG_PATTERNS),
  patternColor: hex,
  patternOpacity: z.number().min(0).max(1),
  patternScale: z.number().min(0.3).max(4),
  background2: hex,
  bgGradient: z.enum(BG_GRADIENTS),
  vignette: z.number().min(0).max(1),
  bgImageUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/).nullable(),
  bgImageMode: z.enum(BG_IMAGE_MODES),
  bgImageOpacity: z.number().min(0).max(1),
  bgImageScale: z.number().min(0.1).max(5),
  particles: z.enum(PARTICLES),
  particleColor: hex,
  particleDensity: z.number().min(0).max(1),
  nebula: z.number().min(0).max(1),
  outside: hex,
  border: hex,
  wallWidth: z.number().min(1).max(30),
  wallGlow: z.number().min(0).max(1),
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
  growth: z.number().min(0.5).max(10),
});

export const AdsSchema: z.ZodType<AdSettings> = z.object({
  enabled: z.boolean(),
  verifyTags: z.string().max(4000),
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


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
  patternScale: z.number().min(0.1).max(20),
  background2: hex,
  bgGradient: z.enum(BG_GRADIENTS),
  vignette: z.number().min(0).max(1),
  bgImageUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/).nullable(),
  bgImageMode: z.enum(BG_IMAGE_MODES),
  bgImageOpacity: z.number().min(0).max(1),
  bgImageScale: z.number().min(0.05).max(50),
  particles: z.enum(PARTICLES),
  particleColor: hex,
  particleDensity: z.number().min(0).max(1),
  nebula: z.number().min(0).max(1),
  outside: hex,
  border: hex,
  wallWidth: z.number().min(1).max(200),
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
  tracks: z
    .array(z.object({ url: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/), name: z.string().trim().min(1).max(80) }))
    .max(200),
  shuffle: z.boolean(),
});

/** null = use the value from the server's resource profile. */
export const GameSettingsSchema: z.ZodType<GameSettings> = z.object({
  arenaSize: z.number().int().min(800).max(30000).nullable(),
  playersPerRoom: z.number().int().min(1).max(1000).nullable(),
  botsPerRoom: z.number().int().min(0).max(1000).nullable(),
  foodPerRoom: z.number().int().min(10).max(30000).nullable(),
  speed: z.number().min(10).max(3000),
  boostSpeed: z.number().min(10).max(6000),
  boostCost: z.number().min(0).max(1000),
  startMass: z.number().min(1).max(10000),
  spawnProtectionSec: z.number().min(0).max(120),
  growth: z.number().min(0.1).max(1000),
});

export const AdsSchema: z.ZodType<AdSettings> = z.object({
  enabled: z.boolean(),
  verifyTags: z.string().max(4000),
  headCode: z.string().max(20000),
  landingCode: z.string().max(20000),
  deathCode: z.string().max(20000),
  deathEvery: z.number().int().min(1).max(1000),
  reviveEnabled: z.boolean(),
  reviveCode: z.string().max(20000),
  reviveSeconds: z.number().int().min(0).max(300),
  revivePercent: z.number().min(1).max(100),
  reviveMax: z.number().int().min(0).max(1000),
  estimatedCpm: z.number().min(0).max(100000),
  currency: z.string().trim().min(1).max(8),
  playCode: z.string().max(20000),
  playEvery: z.number().int().min(1).max(1000),
  playSkipSeconds: z.number().int().min(0).max(120),
  rootFiles: z
    .array(
      z.object({
        name: z
          .string()
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(js|txt|xml|json)$/)
          .refine((n) => !['ads.txt', 'robots.txt', 'sitemap.xml'].includes(n.toLowerCase())),
        content: z.string().max(200000),
      })
    )
    .max(20),
  tgZone: z.string().trim().regex(/^\d{0,12}$/),
  tgVerify: z.boolean(),
  tgHideWebAds: z.boolean(),
  postbackSecret: z.string().regex(/^[A-Za-z0-9_-]{0,64}$/),
  tgPopupFallback: z.boolean(),
  tgInApp: z.boolean(),
  tgInAppFrequency: z.number().int().min(1).max(100),
  tgInAppCapping: z.number().min(0.01).max(24),
  tgInAppInterval: z.number().int().min(0).max(3600),
  tgInAppTimeout: z.number().int().min(0).max(600),
  tgInAppEveryPage: z.boolean(),
  tgPreroll: z.boolean(),
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


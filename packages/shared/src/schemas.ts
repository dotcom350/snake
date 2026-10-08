import { z } from 'zod';

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  a: z.number().min(-10).max(10),
  b: z.boolean(),
});

export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  nickname: z.string().min(1).max(64),
  sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  skin: z.number().int().min(0).max(255).default(0),
  d: z.enum(['m', 'd']).default('d'),
  l: z.enum(['en', 'es']).default('en'),
  p: z.enum(['web', 'tg']).default('web'),
});

export const ReviveClaimSchema = z.object({
  deathId: z.string(),
  sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});

export const AdminLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const AdminConfigSchema = z.object({
  tickHz: z.number().int().min(5).max(60).optional(),
  roomCapacity: z.number().int().min(2).max(100).optional(),
  maxRooms: z.number().int().min(1).max(100).optional(),
  botMinPerRoom: z.number().int().min(0).max(50).optional(),
  arenaWidth: z.number().int().min(1000).max(10000).optional(),
  arenaHeight: z.number().int().min(1000).max(10000).optional(),
  boostConsumption: z.number().positive().optional(),
  boostMinLength: z.number().int().positive().optional(),
  revivalProtectionDuration: z.number().int().positive().optional(),
  revivalRestorePercent: z.number().int().min(0).max(100).optional(),
  revivalMaxPerRun: z.number().int().positive().optional(),
  adEnable: z.boolean().optional(),
  adFrequencyCap: z.number().int().positive().optional(),
});

export const MonetizationConfigSchema = z.object({
  enable: z.boolean(),
  scriptUrl: z.url().optional(),
  rewardZoneId: z.string().optional(),
  frequencyCapDaily: z.number().int().positive().optional(),
});


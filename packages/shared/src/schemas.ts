import { z } from 'zod';

export const InputIntentSchema = z.object({
  direction: z.number().int().min(0).max(3),
  boost: z.boolean(),
  timestamp: z.number().int().positive(),
});

export const JoinRoomSchema = z.object({
  nickname: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[\p{L}\p{N}\s_-]+$/u, 'Invalid characters in nickname'),
  sessionId: z.string().uuid(),
});

export const GameStateSchema = z.object({
  tick: z.number().int().nonnegative(),
  time: z.number().int().positive(),
  snakes: z.array(
    z.object({
      id: z.string(),
      nickname: z.string(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      segments: z.array(z.tuple([z.number(), z.number()])),
      mass: z.number().positive(),
      boosting: z.boolean(),
      protected: z.boolean(),
    })
  ),
  food: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
    })
  ),
  leaderboard: z.array(
    z.object({
      rank: z.number().int().positive(),
      nickname: z.string(),
      score: z.number().int().nonnegative(),
      isBot: z.boolean(),
    })
  ),
});

export const ReviveClaimSchema = z.object({
  deathId: z.string(),
  sessionId: z.string().uuid(),
});

export const AdminLoginSchema = z.object({
  email: z.string().email(),
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
  scriptUrl: z.string().url().optional(),
  rewardZoneId: z.string().optional(),
  frequencyCapDaily: z.number().int().positive().optional(),
});

export type InputIntent = z.infer<typeof InputIntentSchema>;
export type JoinRoom = z.infer<typeof JoinRoomSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type ReviveClaim = z.infer<typeof ReviveClaimSchema>;
export type AdminLogin = z.infer<typeof AdminLoginSchema>;
export type AdminConfig = z.infer<typeof AdminConfigSchema>;
export type MonetizationConfig = z.infer<typeof MonetizationConfigSchema>;

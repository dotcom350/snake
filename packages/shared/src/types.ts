export type Locale = 'en' | 'es';

export interface Session {
  id: string;
  nickname: string;
  ipHash: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  locale: Locale;
}

export interface Run {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  peakScore: number;
  currentScore: number;
  deathCount: number;
  revivalUsed: boolean;
}

export interface ReviveClaim {
  id: string;
  runId: string;
  sessionId: string;
  deathId: string;
  createdAt: number;
  expiresAt: number;
  status: 'waiting' | 'ad_shown' | 'verified' | 'expired' | 'used';
  verifiedAt?: number;
  restoreMass: number;
  respawnX: number;
  respawnY: number;
}

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt?: number;
  permissions: ('view_metrics' | 'edit_settings' | 'edit_ads' | 'manage_players')[];
}

export interface Metrics {
  humanPlayers: number;
  botCount: number;
  roomCount: number;
  peakConcurrent: number;
  activeSessions: number;
  runsStarted: number;
  deathsTotal: number;
  revivalsTotal: number;
  avgPlayDuration: number;
}

export type ErrorCode =
  | 'NICKNAME_INVALID'
  | 'NICKNAME_TAKEN'
  | 'ROOM_FULL'
  | 'SERVER_FULL'
  | 'SESSION_EXPIRED'
  | 'INVALID_INPUT'
  | 'REVIVE_UNAVAILABLE'
  | 'REVIVE_ALREADY_USED'
  | 'REVIVE_CLAIM_EXPIRED'
  | 'AD_NOT_CONFIGURED'
  | 'AD_BLOCKED'
  | 'AUTH_FAILED'
  | 'PERMISSION_DENIED'
  | 'INVALID_CONFIG'
  | 'INTERNAL_ERROR';

export interface ServerError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ResourceProfile = 'auto' | 'low' | 'standard' | 'high';

export interface ResourceConfig {
  profile: ResourceProfile;
  tickHz: number;
  roomCapacity: number;
  maxRooms: number;
  botMinPerRoom: number;
  arenaWidth: number;
  arenaHeight: number;
  maxFoodPerRoom: number;
  maxSnakeLength: number;
  connectionLimit: number;
  dbPoolSize: number;
  metricsSampleInterval: number;
  eventRetentionDays: number;
  nodeHeapMB: number;
  appMemLimit: string;
  dbMemLimit: string;
}

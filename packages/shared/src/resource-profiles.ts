import type { ResourceProfile, ResourceConfig } from './types.js';

export const PROFILE_DEFAULTS: Record<ResourceProfile, Omit<ResourceConfig, 'profile'>> = {
  low: {
    tickHz: 15,
    roomCapacity: 12,
    maxRooms: 2,
    botMinPerRoom: 4,
    arenaWidth: 2400,
    arenaHeight: 2400,
    maxFoodPerRoom: 200,
    maxSnakeLength: 250,
    connectionLimit: 60,
    dbPoolSize: 4,
    metricsSampleInterval: 30,
    eventRetentionDays: 14,
    nodeHeapMB: 256,
    appMemLimit: '448m',
    dbMemLimit: '256m',
  },
  standard: {
    tickHz: 20,
    roomCapacity: 20,
    maxRooms: 6,
    botMinPerRoom: 8,
    arenaWidth: 4000,
    arenaHeight: 4000,
    maxFoodPerRoom: 400,
    maxSnakeLength: 400,
    connectionLimit: 150,
    dbPoolSize: 8,
    metricsSampleInterval: 15,
    eventRetentionDays: 30,
    nodeHeapMB: 512,
    appMemLimit: '1g',
    dbMemLimit: '512m',
  },
  high: {
    tickHz: 20,
    roomCapacity: 30,
    maxRooms: 12,
    botMinPerRoom: 10,
    arenaWidth: 5000,
    arenaHeight: 5000,
    maxFoodPerRoom: 600,
    maxSnakeLength: 600,
    connectionLimit: 400,
    dbPoolSize: 12,
    metricsSampleInterval: 10,
    eventRetentionDays: 30,
    nodeHeapMB: 1024,
    appMemLimit: '2g',
    dbMemLimit: '1g',
  },
  auto: {
    tickHz: 20,
    roomCapacity: 20,
    maxRooms: 6,
    botMinPerRoom: 8,
    arenaWidth: 4000,
    arenaHeight: 4000,
    maxFoodPerRoom: 400,
    maxSnakeLength: 400,
    connectionLimit: 150,
    dbPoolSize: 8,
    metricsSampleInterval: 15,
    eventRetentionDays: 30,
    nodeHeapMB: 512,
    appMemLimit: '1g',
    dbMemLimit: '512m',
  },
};

export interface HostResources {
  cpuCount: number;
  memoryBytes: number;
}

export function detectResourceProfile(host?: HostResources): ResourceProfile {
  if (!host) return 'standard';
  const memoryGB = host.memoryBytes / (1024 * 1024 * 1024);
  if (memoryGB <= 1.5 || host.cpuCount <= 1) return 'low';
  if (memoryGB <= 4 || host.cpuCount <= 2) return 'standard';
  return 'high';
}

export function getResourceConfig(profile: ResourceProfile, host?: HostResources): ResourceConfig {
  if (profile === 'auto') {
    const detected = detectResourceProfile(host);
    return { profile: detected, ...PROFILE_DEFAULTS[detected] };
  }

  return {
    profile,
    ...PROFILE_DEFAULTS[profile],
  };
}

export function mergeResourceConfig(
  profile: ResourceConfig,
  overrides?: Partial<Omit<ResourceConfig, 'profile'>>
): ResourceConfig {
  if (!overrides) return profile;

  return {
    ...profile,
    ...overrides,
  };
}

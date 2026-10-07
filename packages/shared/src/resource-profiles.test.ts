import { describe, it, expect } from 'vitest';
import { detectResourceProfile, getResourceConfig, PROFILE_DEFAULTS } from './resource-profiles.js';

describe('Resource Profiles', () => {
  it('should provide profile defaults', () => {
    const low = PROFILE_DEFAULTS['low'];
    expect(low.tickHz).toBe(15);
    expect(low.roomCapacity).toBe(12);
    expect(low.maxRooms).toBe(2);
  });

  it('should detect resource profile automatically', () => {
    expect(detectResourceProfile({ cpuCount: 1, memoryBytes: 1024 ** 3 })).toBe('low');
    expect(detectResourceProfile({ cpuCount: 2, memoryBytes: 4 * 1024 ** 3 })).toBe('standard');
    expect(detectResourceProfile({ cpuCount: 8, memoryBytes: 16 * 1024 ** 3 })).toBe('high');
    expect(detectResourceProfile()).toBe('standard');
  });

  it('should return correct config for auto profile', () => {
    const config = getResourceConfig('auto');
    expect(config.profile).toMatch(/^(low|standard|high)$/);
    expect(config.tickHz).toBeGreaterThan(0);
    expect(config.roomCapacity).toBeGreaterThan(0);
  });

  it('should override config values', () => {
    const base = getResourceConfig('low');
    const overridden = {
      ...base,
      tickHz: 30,
      roomCapacity: 50,
    };
    expect(overridden.tickHz).toBe(30);
    expect(overridden.roomCapacity).toBe(50);
  });

  it('high profile should have higher limits than low', () => {
    const low = PROFILE_DEFAULTS['low'];
    const high = PROFILE_DEFAULTS['high'];
    expect(high.tickHz).toBeGreaterThanOrEqual(low.tickHz);
    expect(high.roomCapacity).toBeGreaterThan(low.roomCapacity);
    expect(high.maxRooms).toBeGreaterThan(low.maxRooms);
    expect(high.connectionLimit).toBeGreaterThan(low.connectionLimit);
  });
});

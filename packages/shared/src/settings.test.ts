import { describe, it, expect } from 'vitest';
import { SETTINGS_SCHEMAS } from './settings.js';
import { DEFAULT_SETTINGS, toPublicConfig } from './site-config.js';

describe('settings', () => {
  it('default settings pass their own validation', () => {
    for (const [section, schema] of Object.entries(SETTINGS_SCHEMAS)) {
      const result = schema.safeParse(DEFAULT_SETTINGS[section as keyof typeof DEFAULT_SETTINGS]);
      expect(result.success, section).toBe(true);
    }
  });

  it('rejects invalid colors and unknown time zones', () => {
    expect(SETTINGS_SCHEMAS.appearance.safeParse({ ...DEFAULT_SETTINGS.appearance, background: 'red' }).success).toBe(false);
    expect(SETTINGS_SCHEMAS.general.safeParse({ timeZone: 'Mars/Olympus' }).success).toBe(false);
    expect(SETTINGS_SCHEMAS.general.safeParse({ timeZone: 'America/Havana' }).success).toBe(true);
  });

  it('public config hides ad code while ads are disabled', () => {
    const cfg = toPublicConfig({ ...DEFAULT_SETTINGS, ads: { ...DEFAULT_SETTINGS.ads, enabled: false, deathCode: '<script>x</script>' } });
    expect(cfg.ads.deathCode).toBe('');
    expect('landingAccent' in cfg.appearance).toBe(false);
  });
});

import type { AllSettings, SettingsSection } from '@snake/shared/site-config';
import { api } from './api';

export interface SettingsResponse {
  settings: AllSettings;
  defaults: AllSettings;
}

let cache: Promise<SettingsResponse> | null = null;

export function loadSettings(force = false): Promise<SettingsResponse> {
  if (force || !cache) cache = api<SettingsResponse>('GET', '/api/admin/settings');
  return cache;
}

export async function saveSettings<K extends SettingsSection>(section: K, value: AllSettings[K]): Promise<AllSettings> {
  const res = await api<{ settings: AllSettings }>('PUT', `/api/admin/settings/${section}`, value);
  const defaults = (await loadSettings()).defaults;
  cache = Promise.resolve({ settings: res.settings, defaults });
  return res.settings;
}

import { storage } from './storage';
import { siteConfig } from './site';

export interface Prefs {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  controlMode: 'joystick' | 'follow';
  boostSide: 'right' | 'left';
  quality: 'high' | 'low';
  showNames: boolean;
  showMinimap: boolean;
  skin: number;
}

export function loadPrefs(): Prefs {
  const sound = siteConfig().sound;
  const defaults: Prefs = {
    musicVolume: sound.musicVolume,
    sfxVolume: sound.sfxVolume,
    muted: false,
    controlMode: 'joystick',
    boostSide: 'right',
    quality: 'high',
    showNames: true,
    showMinimap: true,
    skin: 0,
  };
  try {
    const raw = storage.get('prefs');
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults;
  } catch {
    return defaults;
  }
}

export function savePrefs(p: Prefs): void {
  storage.set('prefs', JSON.stringify(p));
}

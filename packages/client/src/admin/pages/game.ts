import type { GameSettings } from '@snake/shared/site-config';
import { api } from '../api';
import { h, card, field, numberInput } from '../ui';
import { t } from '../i18n';
import { settingsPage } from './common';

interface LiveLimits {
  profile: string;
  limits: { arenaSize: number; playersPerRoom: number; botsPerRoom: number; foodPerRoom: number };
}

type NullableKey = 'arenaSize' | 'playersPerRoom' | 'botsPerRoom' | 'foodPerRoom';
type NumberKey = Exclude<keyof GameSettings, NullableKey>;

export async function render(root: HTMLElement): Promise<void> {
  const live = await api<LiveLimits>('GET', '/api/admin/live');
  await settingsPage(root, 'game', t('gameTitle'), (g, { changed }) => {
    const nullable = (k: NullableKey, min: number, max: number) => {
      const i = numberInput(g[k], { min, max, placeholder: t('auto', { v: live.limits[k] }) });
      i.addEventListener('input', () => {
        g[k] = i.value === '' ? null : Math.round(Number(i.value));
        changed();
      });
      return i;
    };
    const num = (k: NumberKey, min: number, max: number, step = 1) => {
      const i = numberInput(g[k], { min, max, step });
      i.addEventListener('input', () => {
        if (i.value !== '') {
          g[k] = Number(i.value);
          changed();
        }
      });
      return i;
    };
    return [
      h('p', { class: 'notice' }, t('gameIntro', { profile: live.profile })),
      h(
        'div',
        { class: 'grid2' },
        card(
          null,
          field(t('arenaSize'), nullable('arenaSize', 800, 30000)),
          field(t('playersPerRoom'), nullable('playersPerRoom', 1, 1000)),
          field(t('botsPerRoom'), nullable('botsPerRoom', 0, 1000)),
          field(t('foodPerRoom'), nullable('foodPerRoom', 10, 30000))
        ),
        card(
          null,
          field(t('speed'), num('speed', 10, 3000)),
          field(t('boostSpeed'), num('boostSpeed', 10, 6000)),
          field(t('boostCost'), num('boostCost', 0, 1000, 0.5)),
          field(t('startMass'), num('startMass', 1, 10000)),
          field(t('spawnProtection'), num('spawnProtectionSec', 0, 120, 0.5)),
          field(t('growth'), num('growth', 0.1, 1000, 0.25))
        )
      ),
    ];
  });
}

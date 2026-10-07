import { h, card, field, toggle, numberInput } from '../ui';
import { t } from '../i18n';
import { settingsPage } from './common';

function codeArea(value: string, rows: number, onInput: (v: string) => void): HTMLTextAreaElement {
  const ta = h('textarea', { class: 'input code', rows, spellcheck: 'false' });
  ta.value = value;
  ta.addEventListener('input', () => onInput(ta.value));
  return ta;
}

export async function render(root: HTMLElement): Promise<void> {
  await settingsPage(root, 'ads', t('adsTitle'), (ads, { changed }) => {
    const set = <K extends keyof typeof ads>(k: K, v: (typeof ads)[K]) => {
      ads[k] = v;
      changed();
    };
    const every = numberInput(ads.deathEvery, { min: 1, max: 20 });
    every.addEventListener('input', () => set('deathEvery', Math.max(1, Math.min(20, Number(every.value) || 1))));
    return [
      card(
        null,
        h('p', null, t('adsIntro')),
        h('label', { class: 'switch-row' }, toggle(ads.enabled, (v) => set('enabled', v)), h('strong', null, t('adsEnabled')))
      ),
      card(
        null,
        field(t('adsHead'), codeArea(ads.headCode, 5, (v) => set('headCode', v))),
        field(t('adsLanding'), codeArea(ads.landingCode, 5, (v) => set('landingCode', v))),
        field(t('adsDeath'), codeArea(ads.deathCode, 5, (v) => set('deathCode', v))),
        field(t('adsEvery'), every)
      ),
      card(null, field(t('adsTxt'), codeArea(ads.adsTxt, 4, (v) => set('adsTxt', v)))),
      h('p', { class: 'notice' }, t('adsMonetag')),
    ];
  });
}

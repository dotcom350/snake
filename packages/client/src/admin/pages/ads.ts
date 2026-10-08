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
    const num = <K extends 'deathEvery' | 'reviveSeconds' | 'revivePercent' | 'reviveMax' | 'estimatedCpm'>(k: K, min: number, step = 1) => {
      const i = numberInput(ads[k], { min, step });
      i.addEventListener('input', () => {
        if (i.value !== '') set(k, Number(i.value) as (typeof ads)[K]);
      });
      return i;
    };
    const currency = h('input', { class: 'input', maxlength: 8 });
    currency.value = ads.currency;
    currency.addEventListener('input', () => set('currency', currency.value.toUpperCase() || 'USD'));

    return [
      card(
        null,
        h('p', null, t('adsIntro')),
        h('label', { class: 'switch-row' }, toggle(ads.enabled, (v) => set('enabled', v)), h('strong', null, t('adsEnabled')))
      ),
      card(
        t('verifyTitle'),
        h('p', { class: 'muted small' }, t('verifyHelp')),
        field(t('verifyTags'), codeArea(ads.verifyTags, 3, (v) => set('verifyTags', v))),
        h('p', { class: 'muted small' }, t('verifyExample'), h('code', null, '<meta name="monetag" content="92d3efef502a42d1667e5b6899e83cfe">'))
      ),
      h(
        'div',
        { class: 'grid2' },
        card(
          null,
          field(t('adsHead'), codeArea(ads.headCode, 5, (v) => set('headCode', v))),
          field(t('adsLanding'), codeArea(ads.landingCode, 5, (v) => set('landingCode', v))),
          field(t('adsDeath'), codeArea(ads.deathCode, 5, (v) => set('deathCode', v))),
          field(t('adsEvery'), num('deathEvery', 1))
        ),
        card(
          t('reviveTitle'),
          h('label', { class: 'switch-row' }, toggle(ads.reviveEnabled, (v) => set('reviveEnabled', v)), h('strong', null, t('reviveEnabled'))),
          field(t('reviveCode'), codeArea(ads.reviveCode, 5, (v) => set('reviveCode', v))),
          h('div', { class: 'row2' }, field(t('reviveSeconds'), num('reviveSeconds', 0)), field(t('revivePercent'), num('revivePercent', 1))),
          field(t('reviveMax'), num('reviveMax', 0)),
          h('p', { class: 'muted small' }, t('reviveNote'))
        )
      ),
      h(
        'div',
        { class: 'grid2' },
        card(t('earningsSettings'), h('div', { class: 'row2' }, field(t('estimatedCpm'), num('estimatedCpm', 0, 0.01)), field(t('currency'), currency))),
        card(null, field(t('adsTxt'), codeArea(ads.adsTxt, 4, (v) => set('adsTxt', v))))
      ),
      h('p', { class: 'notice' }, t('adsMonetag')),
    ];
  });
}

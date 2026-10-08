import type { RootFile } from '@snake/shared/site-config';
import { h, card, field, toggle, numberInput, toast } from '../ui';
import { t } from '../i18n';
import { settingsPage } from './common';

function codeArea(value: string, rows: number, onInput: (v: string) => void): HTMLTextAreaElement {
  const ta = h('textarea', { class: 'input code', rows, spellcheck: 'false' });
  ta.value = value;
  ta.addEventListener('input', () => onInput(ta.value));
  return ta;
}

export async function render(root: HTMLElement): Promise<void> {
  await settingsPage(root, 'ads', t('adsTitle'), (ads, { changed, redraw }) => {
    const set = <K extends keyof typeof ads>(k: K, v: (typeof ads)[K]) => {
      ads[k] = v;
      changed();
    };
    const num = <
      K extends
        | 'deathEvery'
        | 'reviveSeconds'
        | 'revivePercent'
        | 'reviveMax'
        | 'estimatedCpm'
        | 'playEvery'
        | 'playSkipSeconds'
        | 'tgInAppFrequency'
        | 'tgInAppCapping'
        | 'tgInAppInterval'
        | 'tgInAppTimeout',
    >(
      k: K,
      min: number,
      step = 1
    ) => {
      const i = numberInput(ads[k], { min, step });
      i.addEventListener('input', () => {
        if (i.value !== '') set(k, Number(i.value) as (typeof ads)[K]);
      });
      return i;
    };
    const currency = h('input', { class: 'input', maxlength: 8 });
    currency.value = ads.currency;
    currency.addEventListener('input', () => set('currency', currency.value.toUpperCase() || 'USD'));

    const fileRow = (f: RootFile, i: number) => {
      const nameInput = h('input', { class: 'input mono', maxlength: 64, placeholder: 'sw.js' });
      nameInput.value = f.name;
      nameInput.addEventListener('input', () => {
        f.name = nameInput.value.trim();
        changed();
      });
      const content = codeArea(f.content, 4, (v) => {
        f.content = v;
        changed();
      });
      const del = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, '×');
      del.addEventListener('click', () => {
        ads.rootFiles.splice(i, 1);
        changed();
        redraw();
      });
      return h('div', { class: 'root-file' }, h('div', { class: 'row' }, field(t('fileName'), nameInput), del), field(t('fileContent'), content));
    };
    const addFile = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, `+ ${t('addFile')}`);
    addFile.disabled = ads.rootFiles.length >= 20;
    addFile.addEventListener('click', () => {
      ads.rootFiles.push({ name: 'sw.js', content: '' });
      changed();
      redraw();
    });
    const tgZone = h('input', { class: 'input mono', inputmode: 'numeric', maxlength: 12, placeholder: '1234567' });
    tgZone.value = ads.tgZone;
    tgZone.addEventListener('input', () => set('tgZone', tgZone.value.replace(/\D/g, '')));
    const postback = `${location.origin}/api/monetag/postback?secret=${ads.postbackSecret}&ymid={ymid}&event={reward_event_type}&price={estimated_price}`;
    const postbackInput = h('input', { class: 'input mono', readonly: true });
    postbackInput.value = postback;
    const copyBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, t('copy'));
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(postback);
      } catch {
        postbackInput.select();
        document.execCommand('copy');
      }
      toast(t('copied'));
    });

    const testLink = h('a', { class: 'btn btn-ghost', href: `/${document.documentElement.lang === 'es' ? 'es/' : ''}?adtest=1`, target: '_blank', rel: 'noopener' }, `🧪 ${t('testAds')}`);

    return [
      card(
        null,
        h('p', null, t('adsIntro')),
        h('label', { class: 'switch-row' }, toggle(ads.enabled, (v) => set('enabled', v)), h('strong', null, t('adsEnabled'))),
        h('div', { class: 'row', style: 'margin-top:8px' }, testLink, h('span', { class: 'muted small' }, t('testAdsHelp')))
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
      card(
        t('tgTitle'),
        h('p', null, t('tgIntro')),
        h('p', { class: 'notice' }, t('tgSteps')),
        h(
          'div',
          { class: 'row2' },
          field(t('tgZone'), tgZone),
          h(
            'div',
            null,
            h('label', { class: 'switch-row' }, toggle(ads.tgVerify, (v) => set('tgVerify', v)), t('tgVerify')),
            h('label', { class: 'switch-row' }, toggle(ads.tgHideWebAds, (v) => set('tgHideWebAds', v)), t('tgHideWebAds'))
          )
        ),
        field(t('postbackUrl'), h('div', { class: 'row nowrap' }, postbackInput, copyBtn)),
        h('p', { class: 'muted small' }, t('postbackHelp')),
        h('p', { class: 'muted small' }, t('tgFormats')),
        h('label', { class: 'switch-row' }, toggle(ads.tgPopupFallback, (v) => set('tgPopupFallback', v)), t('tgPopupFallback')),
        h('label', { class: 'switch-row' }, toggle(ads.tgPreroll, (v) => set('tgPreroll', v)), t('tgPreroll')),
        h('label', { class: 'switch-row' }, toggle(ads.tgInApp, (v) => set('tgInApp', v)), h('strong', null, t('tgInApp'))),
        h(
          'div',
          { class: 'row2' },
          field(t('tgInAppFrequency'), num('tgInAppFrequency', 1)),
          field(t('tgInAppCapping'), num('tgInAppCapping', 0.01, 0.05)),
          field(t('tgInAppInterval'), num('tgInAppInterval', 0)),
          field(t('tgInAppTimeout'), num('tgInAppTimeout', 0))
        ),
        h('label', { class: 'switch-row' }, toggle(ads.tgInAppEveryPage, (v) => set('tgInAppEveryPage', v)), t('tgInAppEveryPage'))
      ),
      h(
        'div',
        { class: 'grid2' },
        card(
          t('playAdTitle'),
          field(t('playCode'), codeArea(ads.playCode, 5, (v) => set('playCode', v))),
          h('div', { class: 'row2' }, field(t('playEvery'), num('playEvery', 1)), field(t('playSkip'), num('playSkipSeconds', 0)))
        ),
        card(t('rootFilesTitle'), h('p', { class: 'muted small' }, t('rootFilesHelp')), ...ads.rootFiles.map(fileRow), addFile)
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

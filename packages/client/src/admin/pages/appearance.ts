import type { Appearance } from '@snake/shared/site-config';
import { h, card, field, colorInput, select } from '../ui';
import { t } from '../i18n';
import { settingsPage } from './common';
import { arenaPreview } from './preview';

export async function render(root: HTMLElement): Promise<() => void> {
  let current: Appearance | null = null;
  const preview = arenaPreview(
    () => current,
    () => current?.skins ?? []
  );

  await settingsPage(root, 'appearance', t('appearanceTitle'), (a, { changed }) => {
    current = a;
    const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => {
      a[k] = v;
      changed();
    };
    const opacity = h('input', { type: 'range', min: 0, max: 0.4, step: 0.01, class: 'range' });
    opacity.value = String(a.patternOpacity);
    opacity.addEventListener('input', () => set('patternOpacity', Number(opacity.value)));
    const glow = h('input', { type: 'range', min: 0, max: 1, step: 0.05, class: 'range' });
    glow.value = String(a.foodGlow);
    glow.addEventListener('input', () => set('foodGlow', Number(glow.value)));

    const foodList = h('div', { class: 'swatches' });
    const renderFood = () => {
      const items: Node[] = a.foodColors.map((c, i) => {
        const wrap = h('span', { class: 'swatch' });
        wrap.append(
          colorInput(c, (v) => {
            a.foodColors[i] = v;
            changed();
          })
        );
        if (a.foodColors.length > 1) {
          const del = h('button', { type: 'button', class: 'x', 'aria-label': 'remove' }, '×');
          del.addEventListener('click', () => {
            a.foodColors.splice(i, 1);
            changed();
            renderFood();
          });
          wrap.append(del);
        }
        return wrap;
      });
      if (a.foodColors.length < 16) {
        const add = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, `+ ${t('addColor')}`);
        add.addEventListener('click', () => {
          a.foodColors.push('#ffffff');
          changed();
          renderFood();
        });
        items.push(add);
      }
      foodList.replaceChildren(...items);
    };
    renderFood();

    return [
      card(t('preview'), preview.canvas),
      h(
        'div',
        { class: 'grid2' },
        card(
          t('appearanceTitle'),
          field(t('background'), colorInput(a.background, (v) => set('background', v))),
          field(
            t('bgPattern'),
            select(
              a.bgPattern,
              [
                ['hex', t('patternHex')],
                ['grid', t('patternGrid')],
                ['dots', t('patternDots')],
                ['none', t('patternNone')],
              ],
              (v) => set('bgPattern', v)
            )
          ),
          field(t('patternColor'), colorInput(a.patternColor, (v) => set('patternColor', v))),
          field(t('patternOpacity'), opacity),
          field(t('outside'), colorInput(a.outside, (v) => set('outside', v))),
          field(t('border'), colorInput(a.border, (v) => set('border', v)))
        ),
        card(
          t('food'),
          field(t('foodGlow'), glow),
          field(t('foodColors'), foodList),
          h('h3', { class: 'sub' }, t('landingTitle')),
          field(t('accent'), colorInput(a.landingAccent, (v) => set('landingAccent', v))),
          field(t('accent2'), colorInput(a.landingAccent2, (v) => set('landingAccent2', v))),
          field(t('landingBg'), colorInput(a.landingBackground, (v) => set('landingBackground', v)))
        )
      ),
    ];
  });
  return preview.stop;
}

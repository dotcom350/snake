import { SKIN_PATTERNS, HEAD_SHAPES, MAX_SKINS, type SkinDef, type SkinPattern, type HeadShape } from '@snake/shared/site-config';
import { h, field, colorInput, select, toggle } from '../ui';
import { t, type Key } from '../i18n';
import { settingsPage } from './common';
import { drawSkinPreview } from '../../game/skins';

const PATTERN_LABEL: Record<SkinPattern, Key> = {
  solid: 'patSolid',
  bands: 'patBands',
  stripes: 'patStripes',
  gradient: 'patGradient',
  rainbow: 'patRainbow',
  scales: 'patScales',
  spots: 'patSpots',
  neon: 'patNeon',
  galaxy: 'patGalaxy',
};
const HEAD_LABEL: Record<HeadShape, Key> = { round: 'headRound', viper: 'headViper', cute: 'headCute' };

export async function render(root: HTMLElement): Promise<() => void> {
  let skins: SkinDef[] = [];
  const canvases = new Map<HTMLCanvasElement, () => SkinDef>();
  let raf = 0;
  const animate = (time: number) => {
    raf = requestAnimationFrame(animate);
    for (const [c, get] of canvases) if (c.isConnected) drawSkinPreview(c, get(), time);
  };
  raf = requestAnimationFrame(animate);

  await settingsPage(root, 'appearance', t('skinsTitle'), (appearance, { changed }) => {
    skins = appearance.skins;
    canvases.clear();
    const list = h('div', { class: 'skin-grid' });

    const renderList = () => {
      canvases.clear();
      list.replaceChildren(
        ...skins.map((skin, index) => {
          const canvas = h('canvas', { class: 'skin-canvas' });
          canvases.set(canvas, () => skins[index]);
          const name = h('input', { class: 'input', maxlength: 24 });
          name.value = skin.name;
          name.addEventListener('input', () => {
            skin.name = name.value.slice(0, 24) || '?';
            changed();
          });

          const colors = h('div', { class: 'swatches' });
          const renderColors = () => {
            const items: Node[] = skin.colors.map((c, ci) => {
              const wrap = h('span', { class: 'swatch' });
              wrap.append(
                colorInput(c, (v) => {
                  skin.colors[ci] = v;
                  changed();
                })
              );
              if (skin.colors.length > 1) {
                const del = h('button', { type: 'button', class: 'x', 'aria-label': 'remove' }, '×');
                del.addEventListener('click', () => {
                  skin.colors.splice(ci, 1);
                  changed();
                  renderColors();
                });
                wrap.append(del);
              }
              return wrap;
            });
            if (skin.colors.length < 6) {
              const add = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, '+');
              add.addEventListener('click', () => {
                skin.colors.push('#ffffff');
                changed();
                renderColors();
              });
              items.push(add);
            }
            colors.replaceChildren(...items);
          };
          renderColors();

          const del = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, t('deleteSkin'));
          del.disabled = skins.length <= 1;
          del.addEventListener('click', () => {
            if (!confirm(t('confirmDelete'))) return;
            skins.splice(index, 1);
            changed();
            renderList();
          });

          return h(
            'article',
            { class: `skin-card${skin.enabled ? '' : ' off'}` },
            canvas,
            h('div', { class: 'skin-fields' },
              field(t('skinName'), name),
              h('div', { class: 'row2' },
                field(t('pattern'), select(skin.pattern, SKIN_PATTERNS.map((p) => [p, t(PATTERN_LABEL[p])] as [SkinPattern, string]), (v) => {
                  skin.pattern = v;
                  changed();
                })),
                field(t('head'), select(skin.head, HEAD_SHAPES.map((p) => [p, t(HEAD_LABEL[p])] as [HeadShape, string]), (v) => {
                  skin.head = v;
                  changed();
                }))
              ),
              field(t('colors'), colors),
              h('div', { class: 'row' },
                h('label', { class: 'switch-row' }, toggle(skin.glow, (v) => {
                  skin.glow = v;
                  changed();
                }), t('glow')),
                h('label', { class: 'switch-row' }, toggle(skin.enabled, (v) => {
                  skin.enabled = v;
                  changed();
                  renderList();
                }), t('enabled')),
                del
              )
            )
          );
        })
      );
    };
    renderList();

    const add = h('button', { type: 'button', class: 'btn btn-ghost' }, `+ ${t('addSkin')}`);
    add.disabled = skins.length >= MAX_SKINS;
    add.addEventListener('click', () => {
      skins.push({ name: `Snake ${skins.length + 1}`, pattern: 'bands', head: 'round', colors: ['#4ecdc4', '#ffd166'], glow: false, enabled: true });
      changed();
      renderList();
    });

    return [h('p', { class: 'notice' }, t('skinsIntro')), list, add];
  });

  return () => cancelAnimationFrame(raf);
}

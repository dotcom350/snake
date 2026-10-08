import type { Appearance } from '@snake/shared/site-config';
import { api, ApiError } from '../api';
import { h, card, field, colorInput, select, toast } from '../ui';
import { t, type Key } from '../i18n';
import { loadSettings } from '../state';
import { settingsPage } from './common';
import { arenaPreview } from './preview';

type Preset = Partial<Appearance>;

const PRESETS: Array<[Key, string, Preset]> = [
  ['presetArcade', '#3fe0ff', { background: '#151c2e', bgPattern: 'honeycomb', patternColor: '#8fa8ff', patternOpacity: 0.12, patternScale: 1, background2: '#05070f', bgGradient: 'radial', vignette: 0.4, particles: 'sparkles', particleColor: '#9fb4ff', particleDensity: 0.3, nebula: 0.5, outside: '#06070d', border: '#3fe0ff', wallWidth: 8, wallGlow: 0.8, foodColors: ['#ff5d73', '#4ecdc4', '#ffd166', '#8c7bff', '#5ee06a', '#ff8c42', '#3fa7ff', '#f15bb5'] }],
  ['presetNeon', '#4ecdc4', { background: '#0d1428', bgPattern: 'hex', patternColor: '#7896ff', patternOpacity: 0.08, patternScale: 1, background2: '#05070f', bgGradient: 'radial', vignette: 0.35, particles: 'sparkles', particleColor: '#9fb4ff', particleDensity: 0.4, outside: '#1a0d18', border: '#ff5d73', wallWidth: 6, wallGlow: 0.6, foodColors: ['#ff5d73', '#4ecdc4', '#ffd166', '#8c7bff', '#5ee06a', '#ff8c42', '#3fa7ff', '#f15bb5'] }],
  ['presetSpace', '#8c7bff', { background: '#05060f', bgPattern: 'stars', patternColor: '#ffffff', patternOpacity: 0.5, patternScale: 1, background2: '#1a0b3d', bgGradient: 'radial', vignette: 0.5, particles: 'sparkles', particleColor: '#ffffff', particleDensity: 0.5, outside: '#000000', border: '#8c7bff', wallWidth: 4, wallGlow: 0.8, foodColors: ['#ffffff', '#8c7bff', '#3fa7ff', '#f15bb5', '#ffd166'] }],
  ['presetOcean', '#4fc3f7', { background: '#0a3a5c', bgPattern: 'waves', patternColor: '#7fd4ff', patternOpacity: 0.15, patternScale: 1.2, background2: '#031a2b', bgGradient: 'linear', vignette: 0.4, particles: 'bubbles', particleColor: '#bfefff', particleDensity: 0.5, outside: '#021320', border: '#4fc3f7', wallWidth: 6, wallGlow: 0.5, foodColors: ['#ffd166', '#ff8c42', '#5ee06a', '#ffffff', '#f15bb5'] }],
  ['presetForest', '#8bc34a', { background: '#1e3d1a', bgPattern: 'scales', patternColor: '#9be29e', patternOpacity: 0.1, patternScale: 1.4, background2: '#0b1f09', bgGradient: 'radial', vignette: 0.45, particles: 'fireflies', particleColor: '#e6ff7a', particleDensity: 0.5, outside: '#0b1408', border: '#8bc34a', wallWidth: 8, wallGlow: 0.3, foodColors: ['#ff5d73', '#ffd166', '#ff8c42', '#f15bb5', '#ffffff'] }],
  ['presetDesert', '#d9a55b', { background: '#c9a66b', bgPattern: 'dots', patternColor: '#7a5a2b', patternOpacity: 0.18, patternScale: 1.5, background2: '#8a6a3b', bgGradient: 'linear', vignette: 0.3, particles: 'none', particleColor: '#ffffff', particleDensity: 0.3, outside: '#5c4425', border: '#8d5524', wallWidth: 10, wallGlow: 0, foodColors: ['#2e7d32', '#d32f2f', '#1565c0', '#6a1b9a', '#ffffff'] }],
  ['presetLava', '#ff5722', { background: '#2a0c06', bgPattern: 'triangles', patternColor: '#ff7043', patternOpacity: 0.12, patternScale: 1, background2: '#000000', bgGradient: 'radial', vignette: 0.5, particles: 'embers', particleColor: '#ff9100', particleDensity: 0.6, outside: '#120403', border: '#ff3d00', wallWidth: 8, wallGlow: 1, foodColors: ['#ffeb3b', '#ff9800', '#ff5722', '#ffffff'] }],
  ['presetCandy', '#ff7eb6', { background: '#ffd6e8', bgPattern: 'circles', patternColor: '#ff7eb6', patternOpacity: 0.25, patternScale: 1, background2: '#ffb3d1', bgGradient: 'radial', vignette: 0.15, particles: 'sparkles', particleColor: '#ffffff', particleDensity: 0.4, outside: '#c2185b', border: '#ff4fa3', wallWidth: 8, wallGlow: 0.4, foodColors: ['#7c4dff', '#00bcd4', '#ffeb3b', '#4caf50', '#ff5722'] }],
  ['presetRetro', '#ff2fd6', { background: '#1a0033', bgPattern: 'grid', patternColor: '#ff2fd6', patternOpacity: 0.35, patternScale: 1.2, background2: '#000000', bgGradient: 'linear', vignette: 0.4, particles: 'none', particleColor: '#ffffff', particleDensity: 0.3, outside: '#0a0014', border: '#00e5ff', wallWidth: 5, wallGlow: 1, foodColors: ['#00e5ff', '#ff2fd6', '#ffea00', '#76ff03'] }],
  ['presetSnow', '#9ccfff', { background: '#e8f4ff', bgPattern: 'hex', patternColor: '#9ccfff', patternOpacity: 0.25, patternScale: 1, background2: '#b3d9ff', bgGradient: 'radial', vignette: 0.2, particles: 'snow', particleColor: '#ffffff', particleDensity: 0.7, outside: '#5c7d99', border: '#4fc3f7', wallWidth: 6, wallGlow: 0.3, foodColors: ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa'] }],
];

function range(value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLElement {
  const r = h('input', { type: 'range', min, max, step, class: 'range' });
  r.value = String(value);
  const out = h('output', { class: 'range-value' }, String(value));
  r.addEventListener('input', () => {
    out.textContent = r.value;
    onInput(Number(r.value));
  });
  return h('div', { class: 'range-row' }, r, out);
}

export async function render(root: HTMLElement): Promise<() => void> {
  let current: Appearance | null = null;
  const preview = arenaPreview(
    () => current,
    () => current?.skins ?? []
  );

  await settingsPage(root, 'appearance', t('appearanceTitle'), (a, { changed, redraw }) => {
    current = a;
    const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => {
      a[k] = v;
      changed();
    };
    const rerender = () => void render(root);

    const presets = h(
      'div',
      { class: 'presets' },
      ...PRESETS.map(([label, swatch, preset]) => {
        const b = h('button', { type: 'button', class: 'preset' }, h('i', { style: `background:${preset.background};border-color:${swatch}` }), t(label));
        b.addEventListener('click', () => {
          Object.assign(a, structuredClone(preset));
          changed();
          redraw();
        });
        return b;
      })
    );

    const foodList = h('div', { class: 'swatches' });
    const renderFood = () => {
      const items: Node[] = a.foodColors.map((c, i) => {
        const wrap = h('span', { class: 'swatch' });
        wrap.append(colorInput(c, (v) => {
          a.foodColors[i] = v;
          changed();
        }));
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

    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'input' });
    const uploadBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, t('uploadImage'));
    uploadBtn.addEventListener('click', async () => {
      const f = file.files?.[0];
      if (!f) return;
      uploadBtn.disabled = true;
      try {
        await api('POST', '/api/admin/background', f, f.type || 'image/png');
        await loadSettings(true);
        toast(t('saved'));
        rerender();
      } catch (err) {
        toast(`${t('saveError')} (${err instanceof ApiError ? err.code : 'ERROR'})`, 'error');
        uploadBtn.disabled = false;
      }
    });
    const removeBtn = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, t('remove'));
    removeBtn.disabled = !a.bgImageUrl;
    removeBtn.addEventListener('click', async () => {
      await api('DELETE', '/api/admin/background');
      await loadSettings(true);
      toast(t('saved'));
      rerender();
    });

    return [
      card(t('preview'), preview.canvas),
      card(t('presets'), h('p', { class: 'muted small' }, t('presetsHelp')), presets),
      h(
        'div',
        { class: 'grid2' },
        card(
          t('floorTitle'),
          field(t('background'), colorInput(a.background, (v) => set('background', v))),
          field(
            t('bgPattern'),
            select(
              a.bgPattern,
              [
                ['honeycomb', t('patternHoneycomb')],
                ['hex', t('patternHex')],
                ['grid', t('patternGrid')],
                ['dots', t('patternDots')],
                ['diamonds', t('patternDiamonds')],
                ['triangles', t('patternTriangles')],
                ['circles', t('patternCircles')],
                ['stars', t('patternStars')],
                ['waves', t('patternWaves')],
                ['bricks', t('patternBricks')],
                ['scales', t('patternScalesBg')],
                ['cross', t('patternCross')],
                ['none', t('patternNone')],
              ],
              (v) => set('bgPattern', v)
            )
          ),
          field(t('patternColor'), colorInput(a.patternColor, (v) => set('patternColor', v))),
          field(t('patternOpacity'), range(a.patternOpacity, 0, 0.6, 0.01, (v) => set('patternOpacity', v))),
          field(t('patternScale'), range(a.patternScale, 0.3, 4, 0.1, (v) => set('patternScale', v)))
        ),
        card(
          t('atmosphereTitle'),
          field(
            t('gradient'),
            select(
              a.bgGradient,
              [
                ['none', t('gradNone')],
                ['radial', t('gradRadial')],
                ['linear', t('gradLinear')],
              ],
              (v) => set('bgGradient', v)
            )
          ),
          field(t('background2'), colorInput(a.background2, (v) => set('background2', v))),
          field(t('vignette'), range(a.vignette, 0, 1, 0.05, (v) => set('vignette', v))),
          field(
            t('particles'),
            select(
              a.particles,
              [
                ['none', t('partNone')],
                ['sparkles', t('partSparkles')],
                ['bubbles', t('partBubbles')],
                ['snow', t('partSnow')],
                ['fireflies', t('partFireflies')],
                ['embers', t('partEmbers')],
              ],
              (v) => set('particles', v)
            )
          ),
          field(t('particleColor'), colorInput(a.particleColor, (v) => set('particleColor', v))),
          field(t('particleDensity'), range(a.particleDensity, 0, 1, 0.05, (v) => set('particleDensity', v))),
          field(t('nebula'), range(a.nebula, 0, 1, 0.05, (v) => set('nebula', v)))
        ),
        card(
          t('imageTitle'),
          h('p', { class: 'muted small' }, t('imageHelp')),
          a.bgImageUrl ? h('img', { src: a.bgImageUrl, alt: '', class: 'thumb' }) : h('p', null, `${t('current')}: ${t('none')}`),
          h('div', { class: 'row' }, file, uploadBtn, removeBtn),
          field(
            t('imageMode'),
            select(
              a.bgImageMode,
              [
                ['tile', t('modeTile')],
                ['cover', t('modeCover')],
              ],
              (v) => set('bgImageMode', v)
            )
          ),
          field(t('imageOpacity'), range(a.bgImageOpacity, 0, 1, 0.05, (v) => set('bgImageOpacity', v))),
          field(t('imageScale'), range(a.bgImageScale, 0.1, 5, 0.1, (v) => set('bgImageScale', v)))
        ),
        card(
          t('wallTitle'),
          field(t('border'), colorInput(a.border, (v) => set('border', v))),
          field(t('wallWidth'), range(a.wallWidth, 1, 30, 1, (v) => set('wallWidth', v))),
          field(t('wallGlow'), range(a.wallGlow, 0, 1, 0.05, (v) => set('wallGlow', v))),
          field(t('outside'), colorInput(a.outside, (v) => set('outside', v)))
        ),
        card(t('food'), field(t('foodGlow'), range(a.foodGlow, 0, 1, 0.05, (v) => set('foodGlow', v))), field(t('foodColors'), foodList)),
        card(
          t('landingTitle'),
          field(t('accent'), colorInput(a.landingAccent, (v) => set('landingAccent', v))),
          field(t('accent2'), colorInput(a.landingAccent2, (v) => set('landingAccent2', v))),
          field(t('landingBg'), colorInput(a.landingBackground, (v) => set('landingBackground', v)))
        )
      ),
    ];
  });
  return preview.stop;
}

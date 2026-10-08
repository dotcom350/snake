import {
  SKIN_PATTERNS,
  HEAD_SHAPES,
  EYE_STYLES,
  ACCESSORIES,
  MAX_SKINS,
  DEFAULT_SKINS,
  type SkinDef,
  type SkinPattern,
  type HeadShape,
  type EyeStyle,
  type Accessory,
} from '@snake/shared/site-config';
import { h, field, colorInput, select, toggle } from '../ui';
import { t, getLang, type Key } from '../i18n';
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
  diamonds: 'patDiamonds',
  dots: 'patDots',
  camo: 'patCamo',
  fire: 'patFire',
  chrome: 'patChrome',
};
const HEAD_LABEL: Record<HeadShape, Key> = { round: 'headRound', viper: 'headViper', cute: 'headCute', cobra: 'headCobra', dragon: 'headDragon' };
const EYE_LABEL: Record<EyeStyle, Key> = { normal: 'eyeNormal', angry: 'eyeAngry', sleepy: 'eyeSleepy', cyclops: 'eyeCyclops', googly: 'eyeGoogly' };
const ACC_LABEL: Record<Accessory, Key> = { none: 'accNone', crown: 'accCrown', horns: 'accHorns', hat: 'accHat', bow: 'accBow', glasses: 'accGlasses', antenna: 'accAntenna' };

const COLORS_FOR: Record<SkinPattern, number> = {
  solid: 1, bands: 3, stripes: 2, gradient: 3, rainbow: 1, scales: 3, spots: 2, neon: 1, galaxy: 3, diamonds: 3, dots: 2, camo: 4, fire: 3, chrome: 1,
};

function hsl(hh: number, s: number, l: number): string {
  const k = (n: number) => (n + hh / 30) % 12;
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const NAME_PARTS = {
  en: { a: ['Shadow', 'Neon', 'Royal', 'Crazy', 'Golden', 'Frost', 'Toxic', 'Turbo', 'Mystic', 'Lucky', 'Wild', 'Cosmic'], b: ['Viper', 'Noodle', 'Python', 'Mamba', 'Dragon', 'Slither', 'Fang', 'Coil', 'Serpent', 'Racer'] },
  es: { a: ['Sombra', 'Neón', 'Real', 'Loca', 'Dorada', 'Helada', 'Tóxica', 'Turbo', 'Mística', 'Suertuda', 'Salvaje', 'Cósmica'], b: ['Víbora', 'Fideo', 'Pitón', 'Mamba', 'Dragona', 'Culebra', 'Colmillo', 'Espiral', 'Serpiente', 'Bólida'] },
};

/** Builds a random but harmonious skin. */
export function randomSkin(): SkinDef {
  const pattern = pick(SKIN_PATTERNS);
  const base = Math.random() * 360;
  const scheme = pick(['analogous', 'complementary', 'triad', 'mono'] as const);
  const hues =
    scheme === 'analogous' ? [base, base + 30, base - 30, base + 60]
    : scheme === 'complementary' ? [base, base + 180, base + 20, base + 200]
    : scheme === 'triad' ? [base, base + 120, base + 240, base + 60]
    : [base, base, base, base];
  const lights = [55, 25, 75, 40];
  const colors = Array.from({ length: COLORS_FOR[pattern] }, (_, i) => hsl((hues[i] + 360) % 360, 65 + Math.random() * 30, scheme === 'mono' ? lights[i] : 45 + Math.random() * 20));
  const parts = NAME_PARTS[getLang()];
  const nameOrder = getLang() === 'es' ? [pick(parts.b), pick(parts.a)] : [pick(parts.a), pick(parts.b)];
  return {
    name: nameOrder.join(' ').slice(0, 24),
    pattern,
    head: pick(HEAD_SHAPES),
    colors,
    glow: pattern === 'neon' || pattern === 'fire' || Math.random() < 0.3,
    enabled: true,
    eyes: Math.random() < 0.5 ? 'normal' : pick(EYE_STYLES),
    eyeColor: Math.random() < 0.3 ? hsl(Math.random() * 360, 90, 55) : undefined,
    accessory: Math.random() < 0.35 ? pick(ACCESSORIES.filter((a) => a !== 'none')) : 'none',
    patternScale: Math.round((0.7 + Math.random() * 0.9) * 10) / 10,
    shine: Math.round((0.3 + Math.random() * 0.7) * 10) / 10,
  };
}

function smallRange(value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLElement {
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
  const canvases = new Map<HTMLCanvasElement, () => SkinDef | undefined>();
  let raf = 0;
  const animate = (time: number) => {
    raf = requestAnimationFrame(animate);
    for (const [c, get] of canvases) {
      const skin = get();
      if (c.isConnected && skin) drawSkinPreview(c, skin, time);
    }
  };
  raf = requestAnimationFrame(animate);

  await settingsPage(root, 'appearance', t('skinsTitle'), (appearance, { changed }) => {
    const skins = appearance.skins;
    const list = h('div', { class: 'skin-grid' });

    const renderList = () => {
      canvases.clear();
      list.replaceChildren(...skins.map((skin, index) => skinCard(skin, index)));
    };

    const skinCard = (skin: SkinDef, index: number): HTMLElement => {
      const canvas = h('canvas', { class: 'skin-canvas' });
      canvases.set(canvas, () => skins[index]);
      const update = () => changed();

      const name = h('input', { class: 'input', maxlength: 24 });
      name.value = skin.name;
      name.addEventListener('input', () => {
        skin.name = name.value.slice(0, 24) || '?';
        update();
      });

      const colors = h('div', { class: 'swatches' });
      const renderColors = () => {
        const items: Node[] = skin.colors.map((c, ci) => {
          const wrap = h('span', { class: 'swatch' });
          wrap.append(colorInput(c, (v) => {
            skin.colors[ci] = v;
            update();
          }));
          if (skin.colors.length > 1) {
            const del = h('button', { type: 'button', class: 'x', 'aria-label': 'remove' }, '×');
            del.addEventListener('click', () => {
              skin.colors.splice(ci, 1);
              update();
              renderColors();
            });
            wrap.append(del);
          }
          return wrap;
        });
        if (skin.colors.length < 6) {
          const add = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, '+');
          add.addEventListener('click', () => {
            skin.colors.push(skin.colors[skin.colors.length - 1] ?? '#ffffff');
            update();
            renderColors();
          });
          items.push(add);
        }
        colors.replaceChildren(...items);
      };
      renderColors();

      const eyeAuto = h('input', { type: 'checkbox', class: 'switch' });
      eyeAuto.checked = !skin.eyeColor;
      const eyeColor = colorInput(skin.eyeColor ?? '#10131f', (v) => {
        skin.eyeColor = v;
        eyeAuto.checked = false;
        update();
      });
      eyeAuto.addEventListener('change', () => {
        skin.eyeColor = eyeAuto.checked ? undefined : eyeColor.value;
        update();
      });

      const dup = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, t('duplicate'));
      dup.disabled = skins.length >= MAX_SKINS;
      dup.addEventListener('click', () => {
        const copy = structuredClone(skin);
        copy.name = `${skin.name.slice(0, 20)} 2`;
        skins.splice(index + 1, 0, copy);
        update();
        renderList();
      });
      const reroll = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: t('randomSkin') }, '🎲');
      reroll.addEventListener('click', () => {
        skins[index] = { ...randomSkin(), enabled: skin.enabled };
        update();
        renderList();
      });
      const del = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, t('deleteSkin'));
      del.disabled = skins.length <= 1;
      del.addEventListener('click', () => {
        if (!confirm(t('confirmDelete'))) return;
        skins.splice(index, 1);
        update();
        renderList();
      });

      return h(
        'article',
        { class: `skin-card${skin.enabled ? '' : ' off'}` },
        canvas,
        h(
          'div',
          { class: 'skin-fields' },
          field(t('skinName'), name),
          h(
            'div',
            { class: 'row2' },
            field(t('pattern'), select(skin.pattern, SKIN_PATTERNS.map((p) => [p, t(PATTERN_LABEL[p])] as [SkinPattern, string]), (v) => {
              skin.pattern = v;
              update();
            })),
            field(t('head'), select(skin.head, HEAD_SHAPES.map((p) => [p, t(HEAD_LABEL[p])] as [HeadShape, string]), (v) => {
              skin.head = v;
              update();
            }))
          ),
          h(
            'div',
            { class: 'row2' },
            field(t('eyes'), select(skin.eyes ?? 'normal', EYE_STYLES.map((p) => [p, t(EYE_LABEL[p])] as [EyeStyle, string]), (v) => {
              skin.eyes = v;
              update();
            })),
            field(t('accessory'), select(skin.accessory ?? 'none', ACCESSORIES.map((p) => [p, t(ACC_LABEL[p])] as [Accessory, string]), (v) => {
              skin.accessory = v;
              update();
            }))
          ),
          field(t('colors'), colors),
          field(t('eyeColor'), h('div', { class: 'row' }, eyeColor, h('label', { class: 'switch-row' }, eyeAuto, t('eyeAuto')))),
          h(
            'div',
            { class: 'row2' },
            field(t('patternSize'), smallRange(skin.patternScale ?? 1, 0.3, 3, 0.1, (v) => {
              skin.patternScale = v;
              update();
            })),
            field(t('shine'), smallRange(skin.shine ?? 0.6, 0, 1, 0.05, (v) => {
              skin.shine = v;
              update();
            }))
          ),
          h(
            'div',
            { class: 'row' },
            h('label', { class: 'switch-row' }, toggle(skin.glow, (v) => {
              skin.glow = v;
              update();
            }), t('glow')),
            h('label', { class: 'switch-row' }, toggle(skin.enabled, (v) => {
              skin.enabled = v;
              update();
              renderList();
            }), t('enabled'))
          ),
          h('div', { class: 'row' }, reroll, dup, del)
        )
      );
    };
    renderList();

    const add = h('button', { type: 'button', class: 'btn btn-ghost' }, `+ ${t('addSkin')}`);
    add.disabled = skins.length >= MAX_SKINS;
    add.addEventListener('click', () => {
      skins.push({ name: `Snake ${skins.length + 1}`, pattern: 'bands', head: 'round', colors: ['#4ecdc4', '#ffd166'], glow: false, enabled: true });
      changed();
      renderList();
      list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const random = h('button', { type: 'button', class: 'btn btn-primary' }, `🎲 ${t('randomSkin')}`);
    random.disabled = skins.length >= MAX_SKINS;
    random.addEventListener('click', () => {
      skins.push(randomSkin());
      changed();
      renderList();
      list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const missing = DEFAULT_SKINS.filter((d) => !skins.some((s) => s.name === d.name));
    const builtIn = h('button', { type: 'button', class: 'btn btn-ghost' }, `+ ${t('addBuiltIn')} (${missing.length})`);
    builtIn.disabled = missing.length === 0 || skins.length >= MAX_SKINS;
    builtIn.addEventListener('click', () => {
      for (const d of missing) if (skins.length < MAX_SKINS) skins.push(structuredClone(d));
      changed();
      renderList();
      builtIn.disabled = true;
    });

    return [h('p', { class: 'notice' }, t('skinsIntro')), h('div', { class: 'row toolbar' }, random, add, builtIn), list];
  });

  return () => cancelAnimationFrame(raf);
}

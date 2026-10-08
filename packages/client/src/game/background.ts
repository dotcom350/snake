import type { Appearance } from '@snake/shared/site-config';
import { hexToRgb } from './skins';

export type Theme = Omit<Appearance, 'landingAccent' | 'landingAccent2' | 'landingBackground' | 'skins'>;

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Repeating floor tile, drawn in world units so it scrolls with the camera. */
export function makeBackgroundTile(theme: Pick<Theme, 'background' | 'bgPattern' | 'patternColor' | 'patternOpacity' | 'patternScale'>): HTMLCanvasElement {
  const k = Math.max(0.3, theme.patternScale ?? 1);
  const stroke = rgba(theme.patternColor, theme.patternOpacity);
  const c = document.createElement('canvas');
  const begin = (w: number, h: number) => {
    c.width = Math.max(2, Math.round(w * k));
    c.height = Math.max(2, Math.round(h * k));
    const x = c.getContext('2d')!;
    x.fillStyle = theme.background;
    x.fillRect(0, 0, c.width, c.height);
    x.scale(k, k);
    x.strokeStyle = stroke;
    x.fillStyle = stroke;
    x.lineWidth = 2;
    x.lineJoin = 'round';
    return x;
  };

  switch (theme.bgPattern) {
    case 'hex': {
      const w = 84;
      const h = w * Math.sqrt(3);
      const x = begin(w * 3, h);
      const r = w / 2;
      const hex = (cx: number, cy: number) => {
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          if (i === 0) x.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
          else x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        x.closePath();
        x.stroke();
      };
      for (const [cx, cy] of [[r, 0], [r, h], [r * 4, h / 2], [r * 4, -h / 2], [r * 4, h * 1.5], [r * 7, 0], [r * 7, h]]) hex(cx, cy);
      break;
    }
    case 'grid': {
      const x = begin(80, 80);
      x.beginPath();
      x.moveTo(0, 1);
      x.lineTo(80, 1);
      x.moveTo(1, 0);
      x.lineTo(1, 80);
      x.stroke();
      break;
    }
    case 'dots': {
      const x = begin(60, 60);
      x.beginPath();
      x.arc(30, 30, 3.5, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'diamonds': {
      const x = begin(70, 70);
      x.beginPath();
      x.moveTo(35, 0);
      x.lineTo(70, 35);
      x.lineTo(35, 70);
      x.lineTo(0, 35);
      x.closePath();
      x.stroke();
      break;
    }
    case 'triangles': {
      const w = 80;
      const h = w * 0.866;
      const x = begin(w, h * 2);
      x.beginPath();
      for (const row of [0, 1]) {
        const y0 = row * h;
        const off = row ? w / 2 : 0;
        x.moveTo(-w + off, y0 + h);
        for (let i = -1; i <= 2; i++) {
          x.lineTo(i * w + off - w / 2, y0 + h);
          x.lineTo(i * w + off, y0);
          x.lineTo(i * w + off + w / 2, y0 + h);
        }
      }
      x.moveTo(0, 0);
      x.lineTo(w, 0);
      x.moveTo(0, h);
      x.lineTo(w, h);
      x.stroke();
      break;
    }
    case 'circles': {
      const x = begin(90, 90);
      for (const [cx, cy] of [[45, 45], [0, 0], [90, 0], [0, 90], [90, 90]]) {
        x.beginPath();
        x.arc(cx, cy, 30, 0, Math.PI * 2);
        x.stroke();
      }
      break;
    }
    case 'stars': {
      const x = begin(260, 260);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 46; i++) {
        const big = rnd() < 0.12;
        x.globalAlpha = 0.4 + rnd() * 0.6;
        x.fillStyle = rgba(theme.patternColor, Math.min(1, theme.patternOpacity * 4));
        x.beginPath();
        x.arc(rnd() * 260, rnd() * 260, big ? 2.2 : 0.6 + rnd() * 1.2, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
      break;
    }
    case 'waves': {
      const x = begin(120, 40);
      x.beginPath();
      for (let i = 0; i <= 120; i += 4) {
        const y = 20 + Math.sin((i / 120) * Math.PI * 2) * 8;
        if (i === 0) x.moveTo(i, y);
        else x.lineTo(i, y);
      }
      x.stroke();
      break;
    }
    case 'bricks': {
      const x = begin(120, 60);
      x.beginPath();
      x.moveTo(0, 1);
      x.lineTo(120, 1);
      x.moveTo(0, 31);
      x.lineTo(120, 31);
      x.moveTo(1, 1);
      x.lineTo(1, 31);
      x.moveTo(61, 1);
      x.lineTo(61, 31);
      x.moveTo(31, 31);
      x.lineTo(31, 60);
      x.moveTo(91, 31);
      x.lineTo(91, 60);
      x.stroke();
      break;
    }
    case 'scales': {
      const x = begin(60, 30);
      for (const [cx, cy] of [[0, 0], [60, 0], [30, 15], [0, 30], [60, 30]]) {
        x.beginPath();
        x.arc(cx, cy, 30, 0.15 * Math.PI, 0.85 * Math.PI);
        x.stroke();
      }
      break;
    }
    case 'cross': {
      const x = begin(70, 70);
      x.beginPath();
      x.moveTo(29, 35);
      x.lineTo(41, 35);
      x.moveTo(35, 29);
      x.lineTo(35, 41);
      x.stroke();
      break;
    }
    default:
      begin(8, 8);
  }
  return c;
}

export interface ArenaAssets {
  pattern: CanvasPattern | null;
  image: HTMLImageElement | null;
  imagePattern: CanvasPattern | null;
}

/** Loads (and caches) everything the arena floor needs for a theme. */
export function createArenaAssets(ctx: CanvasRenderingContext2D, theme: Theme, onReady?: () => void): ArenaAssets {
  const assets: ArenaAssets = { pattern: ctx.createPattern(makeBackgroundTile(theme), 'repeat'), image: null, imagePattern: null };
  if (theme.bgImageUrl) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      assets.image = img;
      if (theme.bgImageMode === 'tile') {
        const p = ctx.createPattern(img, 'repeat');
        if (p) {
          const s = theme.bgImageScale || 1;
          p.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
        }
        assets.imagePattern = p;
      }
      onReady?.();
    };
    img.src = theme.bgImageUrl;
  }
  return assets;
}

export interface ArenaView {
  arenaW: number;
  arenaH: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  time: number;
  /** World units per screen pixel inverse (current zoom); used to keep particles a sensible size. */
  scale: number;
  quality: 'high' | 'low';
}

const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Draws the arena floor, image, gradient, particles and wall. Context must be in world coordinates. */
export function drawArena(ctx: CanvasRenderingContext2D, theme: Theme, assets: ArenaAssets, v: ArenaView): void {
  const ax0 = Math.max(0, v.minX);
  const ay0 = Math.max(0, v.minY);
  const ax1 = Math.min(v.arenaW, v.maxX);
  const ay1 = Math.min(v.arenaH, v.maxY);

  if (ax1 > ax0 && ay1 > ay0) {
    ctx.fillStyle = assets.pattern ?? theme.background;
    ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);

    if (assets.image) {
      ctx.globalAlpha = theme.bgImageOpacity;
      if (theme.bgImageMode === 'cover' || !assets.imagePattern) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ax0, ay0, ax1 - ax0, ay1 - ay0);
        ctx.clip();
        ctx.drawImage(assets.image, 0, 0, v.arenaW, v.arenaH);
        ctx.restore();
      } else {
        ctx.fillStyle = assets.imagePattern;
        ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
      }
      ctx.globalAlpha = 1;
    }

    if (theme.bgGradient !== 'none') {
      const g =
        theme.bgGradient === 'radial'
          ? ctx.createRadialGradient(v.arenaW / 2, v.arenaH / 2, 0, v.arenaW / 2, v.arenaH / 2, Math.max(v.arenaW, v.arenaH) * 0.72)
          : ctx.createLinearGradient(0, 0, 0, v.arenaH);
      g.addColorStop(0, rgba(theme.background2, 0));
      g.addColorStop(1, rgba(theme.background2, 0.85));
      ctx.fillStyle = g;
      ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
    }

    if (theme.particles !== 'none' && theme.particleDensity > 0) drawParticles(ctx, theme, v, ax0, ay0, ax1, ay1);
  }

  const ww = theme.wallWidth;
  if (theme.wallGlow > 0) {
    ctx.globalAlpha = 0.35 * theme.wallGlow;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = ww * 4.5;
    ctx.strokeRect(-ww * 2.25, -ww * 2.25, v.arenaW + ww * 4.5, v.arenaH + ww * 4.5);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = ww;
  ctx.strokeRect(-ww / 2, -ww / 2, v.arenaW + ww, v.arenaH + ww);
}

const CELL = 220;

function drawParticles(ctx: CanvasRenderingContext2D, theme: Theme, v: ArenaView, x0: number, y0: number, x1: number, y1: number): void {
  const perCell = Math.round(theme.particleDensity * (v.quality === 'low' ? 3 : 6));
  if (perCell <= 0) return;
  const t = v.time / 1000;
  const color = theme.particleColor;
  const kind = theme.particles;
  const prevOp = ctx.globalCompositeOperation;
  if (kind === 'fireflies' || kind === 'sparkles' || kind === 'embers') ctx.globalCompositeOperation = 'lighter';

  const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
  const cy0 = Math.floor(y0 / CELL), cy1 = Math.floor(y1 / CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let i = 0; i < perCell; i++) {
        const h1 = hash(cx * 7 + i, cy * 13 - i);
        const h2 = hash(cy * 5 + i * 3, cx * 11 + i);
        const h3 = hash(cx + cy * 3 + i * 17, i);
        let x = (cx + h1) * CELL;
        let y = (cy + h2) * CELL;
        let r = 2;
        let alpha = 0.7;
        switch (kind) {
          case 'sparkles':
            alpha = Math.max(0, Math.sin(t * (1.5 + h3 * 2) + h1 * 20)) * 0.9;
            r = 1.5 + h3 * 2.5;
            break;
          case 'bubbles':
            y = ((y - t * (20 + h3 * 30)) % (v.arenaH + 200) + v.arenaH + 200) % (v.arenaH + 200);
            x += Math.sin(t + h1 * 10) * 10;
            r = 4 + h3 * 9;
            alpha = 0.35;
            break;
          case 'snow':
            y = (y + t * (25 + h3 * 35)) % (v.arenaH + 100);
            x += Math.sin(t * 0.8 + h2 * 10) * 18;
            r = 1.5 + h3 * 3;
            alpha = 0.8;
            break;
          case 'fireflies':
            x += Math.sin(t * 0.6 + h1 * 30) * 40;
            y += Math.cos(t * 0.5 + h2 * 30) * 40;
            r = 6 + h3 * 6;
            alpha = 0.25 + 0.3 * Math.max(0, Math.sin(t * 2 + h3 * 15));
            break;
          case 'embers':
            y = ((y - t * (35 + h3 * 45)) % (v.arenaH + 100) + v.arenaH + 100) % (v.arenaH + 100);
            x += Math.sin(t * 2 + h1 * 9) * 12;
            r = 1.5 + h3 * 2.5;
            alpha = 0.5 + 0.5 * Math.sin(t * 6 + h2 * 9);
            break;
        }
        if (x < x0 || x > x1 || y < y0 || y > y1 || alpha <= 0.02) continue;
        ctx.globalAlpha = Math.min(1, alpha);
        if (kind === 'bubbles') {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 'fireflies') {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, color);
          g.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          if (kind === 'sparkles' && r > 3) {
            ctx.fillRect(x - r * 2, y - 0.5, r * 4, 1);
            ctx.fillRect(x - 0.5, y - r * 2, 1, r * 4);
          }
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prevOp;
}

let vignetteCache: { w: number; h: number; s: number; g: CanvasGradient } | null = null;

/** Darkens the screen edges. Context must be in screen (CSS pixel) coordinates. */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  if (strength <= 0) return;
  if (!vignetteCache || vignetteCache.w !== w || vignetteCache.h !== h || vignetteCache.s !== strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.75 * strength})`);
    vignetteCache = { w, h, s: strength, g };
  }
  ctx.fillStyle = vignetteCache.g;
  ctx.fillRect(0, 0, w, h);
}

import type { Appearance, SkinDef } from '@snake/shared/site-config';
import { createArenaAssets, drawArena, drawVignette, type ArenaAssets } from '../../game/background';
import { drawSnake, swimPath } from '../../game/skins';

const BG_KEYS: Array<keyof Appearance> = [
  'background', 'bgPattern', 'patternColor', 'patternOpacity', 'patternScale', 'bgImageUrl', 'bgImageMode', 'bgImageScale',
];

/** Animated arena preview used by the Appearance and Snakes pages; uses the same drawing code as the game. */
export function arenaPreview(getTheme: () => Appearance | null, getSkins: () => SkinDef[]): { canvas: HTMLCanvasElement; stop: () => void } {
  const canvas = document.createElement('canvas');
  canvas.className = 'preview';
  let raf = 0;
  let assetsKey = '';
  let assets: ArenaAssets | null = null;
  const food = Array.from({ length: 30 }, () => [Math.random(), Math.random(), Math.random()]);

  const frame = (time: number) => {
    raf = requestAnimationFrame(frame);
    const theme = getTheme();
    if (!theme) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    const key = BG_KEYS.map((k) => String(theme[k])).join('|');
    if (key !== assetsKey || !assets) {
      assetsKey = key;
      assets = createArenaAssets(ctx, theme);
    }

    // A slowly drifting camera over the arena's left edge so the wall is visible.
    const zoom = 0.8;
    const arena = 2400;
    const camX = 420 + Math.sin(time / 6000) * 60;
    const camY = 900 + Math.cos(time / 7000) * 60;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, w, h);
    const ox = w / 2 - camX * zoom;
    const oy = h / 2 - camY * zoom;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * ox, dpr * oy);
    const minX = camX - w / 2 / zoom, maxX = camX + w / 2 / zoom;
    const minY = camY - h / 2 / zoom, maxY = camY + h / 2 / zoom;
    drawArena(ctx, theme, assets, { arenaW: arena, arenaH: arena, minX, minY, maxX, maxY, time, scale: zoom, quality: 'high' });

    const alphaHex = Math.round((0.35 + theme.foodGlow * 0.5) * 255).toString(16).padStart(2, '0');
    for (const [fx, fy, c] of food) {
      const color = theme.foodColors[Math.floor(c * theme.foodColors.length)] ?? '#ffffff';
      const x = Math.max(30, minX) + fx * (maxX - Math.max(30, minX));
      const y = minY + fy * (maxY - minY);
      const r = 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.2, color);
      g.addColorStop(0.35, color + alphaHex);
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const skins = getSkins().filter((s) => s.enabled).slice(0, 3);
    const span = maxX - minX;
    skins.forEach((skin, i) => {
      const baseY = minY + ((maxY - minY) / (skins.length + 1)) * (i + 1);
      const path = swimPath(minX + span * 0.88, minX + span * 0.35, 18, time + i * 400);
      for (let k = 1; k < path.length; k += 2) path[k] += baseY;
      drawSnake(ctx, path, skin, { radius: 13, time, boosting: false, alpha: 1, quality: 'high' });
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette(ctx, w, h, theme.vignette);
  };
  raf = requestAnimationFrame(frame);
  return { canvas, stop: () => cancelAnimationFrame(raf) };
}

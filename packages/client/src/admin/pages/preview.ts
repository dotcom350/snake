import type { Appearance, SkinDef } from '@snake/shared/site-config';
import { makeBackgroundTile } from '../../game/render';
import { drawSnake } from '../../game/skins';

/** Small animated arena preview used by the Appearance and Snakes pages. */
export function arenaPreview(getTheme: () => Appearance | null, getSkins: () => SkinDef[]): { canvas: HTMLCanvasElement; stop: () => void } {
  const canvas = document.createElement('canvas');
  canvas.className = 'preview';
  let raf = 0;
  let tileKey = '';
  let pattern: CanvasPattern | null = null;
  const food = Array.from({ length: 26 }, () => [Math.random(), Math.random(), Math.random()]);

  const frame = (time: number) => {
    raf = requestAnimationFrame(frame);
    const theme = getTheme();
    if (!theme) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    const key = `${theme.background}${theme.bgPattern}${theme.patternColor}${theme.patternOpacity}`;
    if (key !== tileKey) {
      tileKey = key;
      pattern = ctx.createPattern(makeBackgroundTile(theme), 'repeat');
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, w, h);
    const ax = w * 0.12;
    ctx.fillStyle = pattern ?? theme.background;
    ctx.fillRect(ax, 0, w - ax, h);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, h);
    ctx.stroke();

    const alphaHex = Math.round((0.35 + theme.foodGlow * 0.5) * 255).toString(16).padStart(2, '0');
    for (const [fx, fy, c] of food) {
      const color = theme.foodColors[Math.floor(c * theme.foodColors.length)] ?? '#ffffff';
      const x = ax + 20 + fx * (w - ax - 40);
      const y = 10 + fy * (h - 20);
      const r = 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.2, color);
      g.addColorStop(0.35, color + alphaHex);
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const skins = getSkins().filter((s) => s.enabled).slice(0, 3);
    skins.forEach((skin, i) => {
      const pts: number[] = [];
      const baseY = (h / (skins.length + 1)) * (i + 1);
      for (let k = 0; k <= 50; k++) {
        const tt = k / 50;
        pts.push(w * 0.85 - tt * w * 0.55, baseY + Math.sin(tt * 7 + time * 0.003 + i) * 14);
      }
      drawSnake(ctx, new Float32Array(pts), skin, { radius: 11, time, boosting: false, alpha: 1, quality: 'high' });
    });
  };
  raf = requestAnimationFrame(frame);
  return { canvas, stop: () => cancelAnimationFrame(raf) };
}

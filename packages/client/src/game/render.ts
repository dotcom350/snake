import { snakeRadius, foodRadius } from '@snake/shared/protocol';
import type { PublicConfig } from '@snake/shared/site-config';
import type { JoystickView } from './input';
import { drawSnake, hexToRgb } from './skins';
import { createArenaAssets, drawArena, drawVignette, type ArenaAssets } from './background';
import { Effects } from './effects';

export { makeBackgroundTile } from './background';

export interface RenderSnake {
  id: number;
  skin: number;
  boosting: boolean;
  protected: boolean;
  mass: number;
  points: Float32Array;
  name: string;
  isSelf: boolean;
}

export interface Frame {
  camX: number;
  camY: number;
  scale: number;
  arenaW: number;
  arenaH: number;
  snakes: RenderSnake[];
  food: Float32Array;
  time: number;
  dt: number;
  joystick: JoystickView;
  selfAlive: boolean;
}

export interface RenderOptions {
  quality: 'high' | 'low';
  showNames: boolean;
  showMinimap: boolean;
}

type Theme = PublicConfig['appearance'];

/** Energy orb: bright core, coloured body and a soft halo whose strength follows the admin's glow setting. */
function makeFoodSprite(color: string, glow: number, rich: boolean): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const m = size / 2;
  const halo = g.createRadialGradient(m, m, 0, m, m, m);
  const k = Math.min(0.75, 0.3 + glow * 0.45) * (rich ? 1.2 : 1);
  halo.addColorStop(0, `rgba(${r},${gg},${b},${k})`);
  halo.addColorStop(0.45, `rgba(${r},${gg},${b},${k * 0.35})`);
  halo.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  const coreR = size * 0.21;
  const core = g.createRadialGradient(m - 2, m - 2, 0, m, m, coreR);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, rich ? '#ffffff' : `rgb(${Math.min(255, r + 90)},${Math.min(255, gg + 90)},${Math.min(255, b + 90)})`);
  core.addColorStop(1, color);
  g.fillStyle = core;
  g.beginPath();
  g.arc(m, m, coreR, 0, Math.PI * 2);
  g.fill();
  return c;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly foodSprites: HTMLCanvasElement[];
  private readonly richSprites: HTMLCanvasElement[];
  private readonly arena: ArenaAssets;
  readonly effects = new Effects();
  private dpr = 1;
  private maxDpr: number;
  width = 0;
  height = 0;
  minimapRadius = 56;
  private frameMs = 16;
  private slowSince = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly theme: Theme,
    public options: RenderOptions
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.foodSprites = theme.foodColors.map((c) => makeFoodSprite(c, theme.foodGlow, false));
    this.richSprites = theme.foodColors.map((c) => makeFoodSprite(c, theme.foodGlow, true));
    this.arena = createArenaAssets(this.ctx, theme);
    this.maxDpr = this.qualityDpr();
    this.resize();
  }

  foodColor(index: number): string {
    return this.theme.foodColors[index % this.theme.foodColors.length];
  }

  skinColor(skin: number): string {
    const s = this.theme.skins[skin] ?? this.theme.skins[0];
    return s.pattern === 'rainbow' ? '#ff5d73' : s.colors[s.colors.length > 1 && s.pattern === 'stripes' ? 1 : 0];
  }

  private qualityDpr(): number {
    return this.options.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  }

  setOptions(options: RenderOptions): void {
    this.options = options;
    this.maxDpr = this.qualityDpr();
    this.effects.setMax(options.quality === 'low' ? 60 : 160);
    this.resize();
  }

  resize(): void {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.dpr = this.maxDpr;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.minimapRadius = Math.round(Math.max(40, Math.min(64, Math.min(this.width, this.height) * 0.1)));
  }

  /** Drops resolution on slow devices instead of dropping frames. */
  trackFrameTime(ms: number, now: number): void {
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    if (this.frameMs > 22 && this.maxDpr > 1) {
      if (!this.slowSince) this.slowSince = now;
      else if (now - this.slowSince > 2000) {
        this.maxDpr = 1;
        this.effects.setMax(80);
        this.resize();
      }
    } else {
      this.slowSince = 0;
    }
  }

  draw(f: Frame): void {
    const { ctx, width: w, height: h, theme } = this;
    const s = f.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, w, h);

    const ox = w / 2 - f.camX * s;
    const oy = h / 2 - f.camY * s;
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * ox, this.dpr * oy);

    const viewMinX = f.camX - w / 2 / s - 60;
    const viewMaxX = f.camX + w / 2 / s + 60;
    const viewMinY = f.camY - h / 2 / s - 60;
    const viewMaxY = f.camY + h / 2 / s + 60;

    drawArena(ctx, theme, this.arena, {
      arenaW: f.arenaW,
      arenaH: f.arenaH,
      minX: viewMinX,
      minY: viewMinY,
      maxX: viewMaxX,
      maxY: viewMaxY,
      time: f.time,
      scale: s,
      quality: this.options.quality,
    });

    const food = f.food;
    const t = f.time / 320;
    for (let i = 0; i < food.length; i += 4) {
      const x = food[i];
      const y = food[i + 1];
      if (x < viewMinX || x > viewMaxX || y < viewMinY || y > viewMaxY) continue;
      const size = food[i + 2];
      const rich = size >= 3;
      // Each orb pulses with its own phase so the field shimmers instead of blinking together.
      const pulse = 1 + 0.09 * Math.sin(t + (x * 0.013 + y * 0.029));
      const r = foodRadius(size) * (rich ? 3.4 : 3.0) * pulse;
      const set = rich ? this.richSprites : this.foodSprites;
      ctx.drawImage(set[food[i + 3] % set.length], x - r, y - r, r * 2, r * 2);
    }

    const skins = theme.skins;
    for (const snake of f.snakes) {
      const skin = skins[snake.skin] ?? skins[0];
      const alpha = snake.protected ? 0.5 + 0.25 * Math.sin(f.time / 90) : 1;
      drawSnake(ctx, snake.points, skin, {
        radius: snakeRadius(snake.mass),
        time: f.time,
        boosting: snake.boosting,
        alpha,
        quality: this.options.quality,
      });
    }

    this.effects.update(f.dt);
    this.effects.draw(ctx, viewMinX, viewMinY, viewMaxX, viewMaxY);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.options.showNames) {
      ctx.font = '700 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const snake of f.snakes) {
        if (snake.isSelf || !snake.name || snake.points.length < 2) continue;
        const sx = ox + snake.points[0] * s;
        const sy = oy + snake.points[1] * s - (snakeRadius(snake.mass) * 1.7 + 10) * s - 6;
        if (sx < -60 || sx > w + 60 || sy < -20 || sy > h + 20) continue;
        const tw = ctx.measureText(snake.name).width + 12;
        ctx.fillStyle = 'rgba(6,10,22,0.55)';
        ctx.beginPath();
        ctx.roundRect(sx - tw / 2, sy - 9, tw, 18, 9);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(snake.name, sx, sy + 0.5);
      }
    }

    drawVignette(ctx, w, h, theme.vignette);
    if (this.options.showMinimap) this.drawMinimap(f);
    if (f.joystick.active) this.drawJoystick(f.joystick);
  }

  private drawMinimap(f: Frame): void {
    const ctx = this.ctx;
    const R = this.minimapRadius;
    const pad = 14;
    const cx = this.width - pad - R;
    const cy = this.height - pad - R;

    ctx.fillStyle = 'rgba(8,12,26,0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();

    // Arena square inscribed in the circle.
    const side = R * 1.38;
    const k = side / Math.max(f.arenaW, f.arenaH);
    const x0 = cx - (f.arenaW * k) / 2;
    const y0 = cy - (f.arenaH * k) / 2;
    ctx.strokeStyle = this.theme.border;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, f.arenaW * k, f.arenaH * k);
    ctx.globalAlpha = 1;

    if (f.selfAlive) {
      const px = x0 + f.camX * k;
      const py = y0 + f.camY * k;
      const pulse = (f.time % 1400) / 1400;
      ctx.strokeStyle = `rgba(255,209,102,${(1 - pulse).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4 + pulse * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0b1020';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawJoystick(j: JoystickView): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(j.baseX, j.baseY, 10, j.baseX, j.baseY, 60);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const dx = j.knobX - j.baseX;
    const dy = j.knobY - j.baseY;
    const len = Math.hypot(dx, dy);
    if (len > 8) {
      const a = Math.atan2(dy, dx);
      const ax = j.baseX + Math.cos(a) * 70;
      const ay = j.baseY + Math.sin(a) * 70;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(a) * 10, ay + Math.sin(a) * 10);
      ctx.lineTo(ax + Math.cos(a + 2.4) * 9, ay + Math.sin(a + 2.4) * 9);
      ctx.lineTo(ax + Math.cos(a - 2.4) * 9, ay + Math.sin(a - 2.4) * 9);
      ctx.closePath();
      ctx.fill();
    }
    const kg = ctx.createRadialGradient(j.knobX - 6, j.knobY - 6, 2, j.knobX, j.knobY, 26);
    kg.addColorStop(0, 'rgba(255,255,255,0.65)');
    kg.addColorStop(1, 'rgba(255,255,255,0.22)');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(j.knobX, j.knobY, 25, 0, Math.PI * 2);
    ctx.fill();
  }
}

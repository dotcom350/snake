import { snakeRadius, foodRadius } from '@snake/shared/protocol';
import type { Appearance, PublicConfig } from '@snake/shared/site-config';
import type { JoystickView } from './input';
import { drawSnake, hexToRgb } from './skins';

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
  joystick: JoystickView;
  selfAlive: boolean;
}

export interface RenderOptions {
  quality: 'high' | 'low';
  showNames: boolean;
  showMinimap: boolean;
}

type Theme = PublicConfig['appearance'];

function makeFoodSprite(color: string, glow: number): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.16, color);
  grad.addColorStop(0.3, `rgba(${r},${gg},${b},${0.35 + glow * 0.5})`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Tile for the arena floor; drawn in world coordinates so it scrolls with the camera. */
export function makeBackgroundTile(theme: Pick<Appearance, 'background' | 'bgPattern' | 'patternColor' | 'patternOpacity'>): HTMLCanvasElement {
  const [r, g, b] = hexToRgb(theme.patternColor);
  const stroke = `rgba(${r},${g},${b},${theme.patternOpacity})`;
  const c = document.createElement('canvas');
  const ctx = (w: number, h: number) => {
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.fillStyle = theme.background;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = stroke;
    x.fillStyle = stroke;
    x.lineWidth = 2;
    return x;
  };

  if (theme.bgPattern === 'hex') {
    const w = 84;
    const h = Math.round(w * Math.sqrt(3));
    const x = ctx(w * 3, h);
    const rad = w / 2;
    const hex = (cx: number, cy: number) => {
      x.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        if (i === 0) x.moveTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
        else x.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
      }
      x.closePath();
      x.stroke();
    };
    for (const [cx, cy] of [[rad, 0], [rad, h], [rad * 4, h / 2], [rad * 4, -h / 2], [rad * 4, h * 1.5], [rad * 7, 0], [rad * 7, h]]) hex(cx, cy);
  } else if (theme.bgPattern === 'grid') {
    const x = ctx(80, 80);
    x.beginPath();
    x.moveTo(0, 0.5);
    x.lineTo(80, 0.5);
    x.moveTo(0.5, 0);
    x.lineTo(0.5, 80);
    x.stroke();
  } else if (theme.bgPattern === 'dots') {
    const x = ctx(60, 60);
    x.beginPath();
    x.arc(30, 30, 3, 0, Math.PI * 2);
    x.fill();
  } else {
    ctx(8, 8);
  }
  return c;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly foodSprites: HTMLCanvasElement[];
  private readonly pattern: CanvasPattern | null;
  private dpr = 1;
  private maxDpr: number;
  width = 0;
  height = 0;
  private frameMs = 16;
  private slowSince = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly theme: Theme,
    public options: RenderOptions
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.foodSprites = theme.foodColors.map((c) => makeFoodSprite(c, theme.foodGlow));
    this.pattern = this.ctx.createPattern(makeBackgroundTile(theme), 'repeat');
    this.maxDpr = this.qualityDpr();
    this.resize();
  }

  private qualityDpr(): number {
    return this.options.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  }

  setOptions(options: RenderOptions): void {
    this.options = options;
    this.maxDpr = this.qualityDpr();
    this.resize();
  }

  resize(): void {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.dpr = this.maxDpr;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  /** Drops resolution on slow devices instead of dropping frames. */
  trackFrameTime(ms: number, now: number): void {
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    if (this.frameMs > 22 && this.maxDpr > 1) {
      if (!this.slowSince) this.slowSince = now;
      else if (now - this.slowSince > 2000) {
        this.maxDpr = 1;
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

    const ax0 = Math.max(0, viewMinX);
    const ay0 = Math.max(0, viewMinY);
    const ax1 = Math.min(f.arenaW, viewMaxX);
    const ay1 = Math.min(f.arenaH, viewMaxY);
    if (ax1 > ax0 && ay1 > ay0) {
      ctx.fillStyle = this.pattern ?? theme.background;
      ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
    }
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 26;
    ctx.strokeRect(-13, -13, f.arenaW + 26, f.arenaH + 26);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 6;
    ctx.strokeRect(-3, -3, f.arenaW + 6, f.arenaH + 6);

    const pulse = 1 + Math.sin(f.time / 300) * 0.1;
    const food = f.food;
    const sprites = this.foodSprites;
    for (let i = 0; i < food.length; i += 4) {
      const x = food[i];
      const y = food[i + 1];
      if (x < viewMinX || x > viewMaxX || y < viewMinY || y > viewMaxY) continue;
      const r = foodRadius(food[i + 2]) * 2.6 * (i % 12 === 0 ? pulse : 1);
      ctx.drawImage(sprites[food[i + 3] % sprites.length], x - r, y - r, r * 2, r * 2);
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

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.options.showNames) {
      ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const snake of f.snakes) {
        if (snake.isSelf || !snake.name || snake.points.length < 2) continue;
        const sx = ox + snake.points[0] * s;
        const sy = oy + snake.points[1] * s - (snakeRadius(snake.mass) * 1.6 + 8) * s;
        if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(snake.name, sx + 1, sy + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(snake.name, sx, sy);
      }
    }

    if (this.options.showMinimap) this.drawMinimap(f);
    if (f.joystick.active) this.drawJoystick(f.joystick);
  }

  private drawMinimap(f: Frame): void {
    const ctx = this.ctx;
    const size = Math.min(110, Math.max(72, this.width * 0.2));
    const pad = 12;
    const x = pad;
    const y = this.height - size - pad;
    const k = size / Math.max(f.arenaW, f.arenaH);
    ctx.fillStyle = 'rgba(10,15,32,0.7)';
    ctx.strokeStyle = this.theme.border;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, f.arenaW * k, f.arenaH * k);
    ctx.strokeRect(x, y, f.arenaW * k, f.arenaH * k);
    ctx.globalAlpha = 1;
    if (f.selfAlive) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + f.camX * k, y + f.camY * k, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawJoystick(j: JoystickView): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(j.knobX, j.knobY, 24, 0, Math.PI * 2);
    ctx.fill();
  }
}

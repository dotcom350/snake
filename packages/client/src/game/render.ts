import { SNAKE_COLORS, snakeRadius, foodRadius } from '@snake/shared/protocol';
import type { JoystickView } from './input';

export interface RenderSnake {
  id: number;
  color: number;
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

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const BODY_DARK = SNAKE_COLORS.map((c) => shade(c, -0.45));

function makeFoodSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.42, color + '88');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function makeHexTile(): HTMLCanvasElement {
  const w = 84;
  const h = Math.round(w * Math.sqrt(3));
  const c = document.createElement('canvas');
  c.width = w * 3;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d1428';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(120,150,255,0.07)';
  g.lineWidth = 2;
  const r = w / 2;
  const hex = (cx: number, cy: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  };
  for (const [cx, cy] of [
    [r, 0], [r, h], [r * 4, h / 2], [r * 4, -h / 2], [r * 4, h * 1.5],
    [r * 7, 0], [r * 7, h],
  ]) hex(cx, cy);
  return c;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly foodSprites = SNAKE_COLORS.map(makeFoodSprite);
  private pattern: CanvasPattern | null = null;
  private dpr = 1;
  private maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  width = 0;
  height = 0;
  private frameMs = 16;
  private slowSince = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.pattern = this.ctx.createPattern(makeHexTile(), 'repeat');
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
    const { ctx, width: w, height: h } = this;
    const s = f.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1a0d18';
    ctx.fillRect(0, 0, w, h);

    const ox = w / 2 - f.camX * s;
    const oy = h / 2 - f.camY * s;
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * ox, this.dpr * oy);

    const viewMinX = f.camX - w / 2 / s - 40;
    const viewMaxX = f.camX + w / 2 / s + 40;
    const viewMinY = f.camY - h / 2 / s - 40;
    const viewMaxY = f.camY + h / 2 / s + 40;

    const ax0 = Math.max(0, viewMinX);
    const ay0 = Math.max(0, viewMinY);
    const ax1 = Math.min(f.arenaW, viewMaxX);
    const ay1 = Math.min(f.arenaH, viewMaxY);
    if (ax1 > ax0 && ay1 > ay0) {
      ctx.fillStyle = this.pattern ?? '#0d1428';
      ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
    }
    ctx.strokeStyle = 'rgba(255,93,115,0.25)';
    ctx.lineWidth = 26;
    ctx.strokeRect(-13, -13, f.arenaW + 26, f.arenaH + 26);
    ctx.strokeStyle = '#ff5d73';
    ctx.lineWidth = 6;
    ctx.strokeRect(-3, -3, f.arenaW + 6, f.arenaH + 6);

    const pulse = 1 + Math.sin(f.time / 300) * 0.08;
    const food = f.food;
    for (let i = 0; i < food.length; i += 4) {
      const x = food[i];
      const y = food[i + 1];
      if (x < viewMinX || x > viewMaxX || y < viewMinY || y > viewMaxY) continue;
      const r = foodRadius(food[i + 2]) * 2.6 * (i % 8 === 0 ? pulse : 1);
      ctx.drawImage(this.foodSprites[food[i + 3] % this.foodSprites.length], x - r, y - r, r * 2, r * 2);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const snake of f.snakes) this.drawSnake(snake, f.time);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const snake of f.snakes) {
      if (snake.isSelf || !snake.name || snake.points.length < 2) continue;
      const sx = ox + snake.points[0] * s;
      const sy = oy + snake.points[1] * s - (snakeRadius(snake.mass) + 8) * s;
      if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(snake.name, sx + 1, sy + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(snake.name, sx, sy);
    }

    this.drawMinimap(f);
    if (f.joystick.active) this.drawJoystick(f.joystick);
  }

  private tracePath(p: Float32Array): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  }

  private drawSnake(sn: RenderSnake, time: number): void {
    const ctx = this.ctx;
    const p = sn.points;
    if (p.length < 2) return;
    const r = snakeRadius(sn.mass);
    const color = SNAKE_COLORS[sn.color % SNAKE_COLORS.length];

    ctx.globalAlpha = sn.protected ? 0.45 + 0.25 * Math.sin(time / 90) : 1;
    this.tracePath(p);
    if (sn.boosting) {
      ctx.strokeStyle = color;
      ctx.globalAlpha *= 0.35;
      ctx.lineWidth = r * 2 + 14;
      ctx.stroke();
      ctx.globalAlpha = sn.protected ? 0.6 : 1;
    }
    ctx.strokeStyle = BODY_DARK[sn.color % BODY_DARK.length];
    ctx.lineWidth = r * 2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2 - 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = r * 0.55;
    ctx.stroke();

    let dx = p[0] - p[2];
    let dy = p[1] - p[3];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const px = -dy;
    const py = dx;
    const hx = p[0];
    const hy = p[1];
    for (const side of [-1, 1]) {
      const ex = hx + dx * r * 0.35 + px * side * r * 0.48;
      const ey = hy + dy * r * 0.35 + py * side * r * 0.48;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.arc(ex + dx * r * 0.14, ey + dy * r * 0.14, r * 0.19, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawMinimap(f: Frame): void {
    const ctx = this.ctx;
    const size = Math.min(110, Math.max(72, this.width * 0.2));
    const pad = 12;
    const x = pad;
    const y = this.height - size - pad;
    const k = size / Math.max(f.arenaW, f.arenaH);
    ctx.fillStyle = 'rgba(10,15,32,0.7)';
    ctx.strokeStyle = 'rgba(255,93,115,0.6)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, f.arenaW * k, f.arenaH * k);
    ctx.strokeRect(x, y, f.arenaW * k, f.arenaH * k);
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

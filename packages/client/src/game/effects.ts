interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  ring: boolean;
  r0: number;
  r1: number;
}

/** Short-lived visual effects (eat, death, boost). Pooled and capped so they never hurt the frame rate. */
export class Effects {
  private items: Particle[] = [];
  private pool: Particle[] = [];

  constructor(private max = 160) {}

  setMax(max: number): void {
    this.max = max;
    if (this.items.length > max) this.items.length = max;
  }

  private add(p: Omit<Particle, never>): void {
    if (this.items.length >= this.max) return;
    const item = this.pool.pop() ?? ({} as Particle);
    Object.assign(item, p);
    this.items.push(item);
  }

  ring(x: number, y: number, color: string, r0: number, r1: number, life: number): void {
    this.add({ x, y, vx: 0, vy: 0, life, max: life, size: 2, color, ring: true, r0, r1 });
  }

  sparks(x: number, y: number, color: string, count: number, speed: number, size: number, life: number, towardX?: number, towardY?: number): void {
    for (let i = 0; i < count; i++) {
      let a = Math.random() * Math.PI * 2;
      if (towardX !== undefined && towardY !== undefined) a = Math.atan2(towardY - y, towardX - x) + (Math.random() - 0.5) * 1.2;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: size * (0.6 + Math.random() * 0.6), color, ring: false, r0: 0, r1: 0 });
    }
  }

  collect(x: number, y: number, color: string, headX: number, headY: number): void {
    this.ring(x, y, color, 4, 18, 0.25);
    this.sparks(x, y, color, 4, 160, 2.6, 0.3, headX, headY);
  }

  burst(x: number, y: number, color: string, strength: number): void {
    this.ring(x, y, color, 10, 60 + strength * 30, 0.5);
    this.ring(x, y, '#ffffff', 6, 30 + strength * 15, 0.35);
    this.sparks(x, y, color, Math.round(10 + strength * 8), 260, 4, 0.7);
  }

  trail(x: number, y: number, color: string): void {
    this.add({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 3 + Math.random() * 3, color, ring: false, r0: 0, r1: 0 });
  }

  update(dt: number): void {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) {
        items[i] = items[items.length - 1];
        items.pop();
        this.pool.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
  }

  /** Context must be in world coordinates. */
  draw(ctx: CanvasRenderingContext2D, minX: number, minY: number, maxX: number, maxY: number): void {
    if (!this.items.length) return;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.2);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + 2 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r1 + (p.r0 - p.r1) * k, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prev;
  }
}

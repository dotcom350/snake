import type { SkinDef } from '@snake/shared/site-config';
import { siteConfig } from './site';
import { createArenaAssets, drawArena, drawVignette } from './game/background';
import { drawSnake } from './game/skins';

interface Critter {
  x: number;
  y: number;
  angle: number;
  turn: number;
  speed: number;
  radius: number;
  skin: SkinDef;
  trail: number[];
  length: number;
  dead: boolean;
  respawnAt: number;
}

interface Orb {
  x: number;
  y: number;
  c: string;
  s: number;
  /** Orbs dropped by a dead snake fade out after a while; 0 = permanent. */
  until: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

/** Live mini-scene behind the hero: real floor, orbs and snakes that eat, crash and respawn. */
export function startHeroBackground(canvas: HTMLCanvasElement, staticFrame: boolean): void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const theme = siteConfig().appearance;
  const assets = createArenaAssets(ctx, theme);
  const skins = theme.skins.filter((s) => s.enabled);
  if (!skins.length) return;

  let w = 0;
  let h = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const ARENA = 8000;
  const camX = ARENA / 2;
  const camY = ARENA / 2;
  let scale = 1;

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    scale = w < 640 ? 0.75 : 1;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const view = () => ({ hw: w / 2 / scale, hh: h / 2 / scale });
  const randomSkin = () => skins[Math.floor(Math.random() * skins.length)];
  const randomColor = () => theme.foodColors[Math.floor(Math.random() * theme.foodColors.length)] ?? '#ffffff';
  const randomPoint = (k = 1) => {
    const { hw, hh } = view();
    return { x: camX + (Math.random() - 0.5) * hw * 2 * k, y: camY + (Math.random() - 0.5) * hh * 2 * k };
  };

  const orbs: Orb[] = Array.from({ length: w < 640 ? 34 : 70 }, () => ({ ...randomPoint(), c: randomColor(), s: 2 + Math.random() * 3, until: 0 }));
  const sparks: Spark[] = [];

  const spawn = (c: Critter) => {
    const { hw, hh } = view();
    const side = Math.floor(Math.random() * 4);
    c.x = side < 2 ? camX + (side ? hw : -hw) * 0.9 : camX + (Math.random() - 0.5) * hw * 1.6;
    c.y = side >= 2 ? camY + (side === 3 ? hh : -hh) * 0.9 : camY + (Math.random() - 0.5) * hh * 1.6;
    c.angle = Math.atan2(camY - c.y, camX - c.x) + (Math.random() - 0.5);
    c.skin = randomSkin();
    c.radius = 10 + Math.random() * 7;
    c.length = 220 + Math.random() * 260;
    c.trail = [];
    c.dead = false;
  };

  const critters: Critter[] = Array.from({ length: w < 640 ? 5 : 7 }, () => {
    const c = { x: 0, y: 0, angle: 0, turn: 0, speed: 60 + Math.random() * 40, radius: 12, skin: skins[0], trail: [], length: 300, dead: false, respawnAt: 0 } as Critter;
    spawn(c);
    const p = randomPoint(0.8);
    c.x = p.x;
    c.y = p.y;
    return c;
  });

  const kill = (c: Critter, now: number) => {
    c.dead = true;
    c.respawnAt = now + 2500 + Math.random() * 2500;
    const color = c.skin.colors[0] ?? '#ffffff';
    for (let i = 0; i < c.trail.length; i += 24) {
      orbs.push({ x: c.trail[i] + (Math.random() - 0.5) * 10, y: c.trail[i + 1] + (Math.random() - 0.5) * 10, c: color, s: 3 + Math.random() * 2, until: now + 15000 });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8, c: color });
    }
  };

  const step = (c: Critter, dt: number) => {
    const { hw, hh } = view();
    const dx = c.x - camX;
    const dy = c.y - camY;
    if (Math.abs(dx) > hw * 0.9 || Math.abs(dy) > hh * 0.9) {
      const toCenter = Math.atan2(-dy, -dx);
      const diff = Math.atan2(Math.sin(toCenter - c.angle), Math.cos(toCenter - c.angle));
      c.turn = Math.sign(diff) * 1.8;
    } else if (Math.random() < dt * 0.8) {
      // Head for a nearby orb now and then, otherwise wander.
      let best: Orb | null = null;
      let bd = 260 * 260;
      for (const o of orbs) {
        const d2 = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = o;
        }
      }
      if (best && Math.random() < 0.7) {
        const target = Math.atan2(best.y - c.y, best.x - c.x);
        const diff = Math.atan2(Math.sin(target - c.angle), Math.cos(target - c.angle));
        c.turn = Math.max(-2.2, Math.min(2.2, diff * 3));
      } else {
        c.turn = (Math.random() - 0.5) * 2.4;
      }
    }
    c.angle += c.turn * dt;
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.trail.unshift(c.x, c.y);
    let acc = 0;
    for (let i = 2; i < c.trail.length; i += 2) {
      acc += Math.hypot(c.trail[i] - c.trail[i - 2], c.trail[i + 1] - c.trail[i - 1]);
      if (acc > c.length) {
        c.trail.length = i + 2;
        break;
      }
    }
  };

  const collide = (now: number) => {
    for (const c of critters) {
      if (c.dead) continue;
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        if ((o.x - c.x) ** 2 + (o.y - c.y) ** 2 < (c.radius + 8) ** 2) {
          c.length = Math.min(900, c.length + o.s * 4);
          if (o.until) orbs.splice(i, 1);
          else Object.assign(o, randomPoint(), { c: randomColor() });
        }
      }
      for (const o of critters) {
        if (o === c || o.dead) continue;
        const reach = (c.radius * 0.5 + o.radius) ** 2;
        for (let i = 8; i < o.trail.length; i += 6) {
          if ((o.trail[i] - c.x) ** 2 + (o.trail[i + 1] - c.y) ** 2 < reach) {
            kill(c, now);
            break;
          }
        }
        if (c.dead) break;
      }
    }
  };

  // Warm up so snakes start with full bodies.
  for (let k = 0; k < 300; k++) for (const c of critters) step(c, 1 / 30);

  const orbSprites = new Map<string, HTMLCanvasElement>();
  const orbSprite = (color: string) => {
    let s = orbSprites.get(color);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = 48;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.18, color);
    grad.addColorStop(0.42, color + '66');
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, 48, 48);
    orbSprites.set(color, s);
    return s;
  };

  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }).observe(canvas);

  const draw = (time: number, dt: number) => {
    const { hw, hh } = view();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w / 2 - camX * scale), dpr * (h / 2 - camY * scale));
    drawArena(ctx, theme, assets, {
      arenaW: ARENA,
      arenaH: ARENA,
      minX: camX - hw - 40,
      minY: camY - hh - 40,
      maxX: camX + hw + 40,
      maxY: camY + hh + 40,
      time,
      scale,
      quality: 'high',
    });
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      let fade = 1;
      if (o.until) {
        const left = o.until - time;
        if (left <= 0) {
          orbs.splice(i, 1);
          continue;
        }
        fade = Math.min(1, left / 2000);
      }
      const r = o.s * 2.8 * (1 + 0.1 * Math.sin(time / 320 + o.x * 0.01));
      ctx.globalAlpha = fade;
      ctx.drawImage(orbSprite(o.c), o.x - r * 1.6, o.y - r * 1.6, r * 3.2, r * 3.2);
    }
    ctx.globalAlpha = 1;
    for (const c of critters) {
      if (!c.dead && c.trail.length >= 4) {
        drawSnake(ctx, new Float32Array(c.trail), c.skin, { radius: c.radius, time, boosting: false, alpha: 1, quality: 'high' });
      }
    }
    if (sparks.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette(ctx, w, h, 0.5);
  };

  if (staticFrame) {
    draw(0, 0);
    return;
  }

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || document.body.classList.contains('in-game')) {
      last = now;
      return;
    }
    if (now - last < 33) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const c of critters) {
      if (c.dead) {
        if (now >= c.respawnAt) spawn(c);
        continue;
      }
      step(c, dt);
    }
    collide(now);
    draw(now, dt);
  };
  requestAnimationFrame(frame);
}

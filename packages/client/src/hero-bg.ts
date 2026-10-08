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
}

/** Live mini-scene behind the hero: the real floor, orbs and snakes from the game. */
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
  const ARENA = 6000;
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

  const orbs = Array.from({ length: w < 640 ? 34 : 70 }, () => {
    const { hw, hh } = view();
    return {
      x: camX + (Math.random() - 0.5) * hw * 2,
      y: camY + (Math.random() - 0.5) * hh * 2,
      c: theme.foodColors[Math.floor(Math.random() * theme.foodColors.length)] ?? '#ffffff',
      s: 2 + Math.random() * 3,
    };
  });

  const pickSkins = [...skins].sort(() => Math.random() - 0.5);
  const critters: Critter[] = Array.from({ length: w < 640 ? 4 : 6 }, (_, i) => {
    const { hw, hh } = view();
    return {
      x: camX + (Math.random() - 0.5) * hw * 1.6,
      y: camY + (Math.random() - 0.5) * hh * 1.6,
      angle: Math.random() * Math.PI * 2,
      turn: 0,
      speed: 55 + Math.random() * 40,
      radius: 11 + Math.random() * 7,
      skin: pickSkins[i % pickSkins.length],
      trail: [],
      length: 260 + Math.random() * 260,
    };
  });

  const step = (c: Critter, dt: number) => {
    const { hw, hh } = view();
    const dx = c.x - camX;
    const dy = c.y - camY;
    if (Math.abs(dx) > hw * 0.85 || Math.abs(dy) > hh * 0.85) {
      const toCenter = Math.atan2(-dy, -dx);
      let diff = toCenter - c.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.turn = Math.sign(diff) * 1.6;
    } else if (Math.random() < dt * 0.6) {
      c.turn = (Math.random() - 0.5) * 2.4;
    }
    c.angle += c.turn * dt;
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.trail.unshift(c.x, c.y);
    // Trim the trail to the snake's length.
    let acc = 0;
    for (let i = 2; i < c.trail.length; i += 2) {
      acc += Math.hypot(c.trail[i] - c.trail[i - 2], c.trail[i + 1] - c.trail[i - 1]);
      if (acc > c.length) {
        c.trail.length = i + 2;
        break;
      }
    }
  };

  // Warm up so snakes start with full bodies.
  for (let k = 0; k < 400; k++) for (const c of critters) step(c, 1 / 30);

  const orbSprites = new Map<string, HTMLCanvasElement>();
  const orbSprite = (color: string) => {
    let s = orbSprites.get(color);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = 48;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.15, color);
    grad.addColorStop(0.4, color + '55');
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

  const draw = (time: number) => {
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
    for (const o of orbs) {
      const r = o.s * 2.6 * (1 + 0.1 * Math.sin(time / 320 + o.x * 0.01));
      ctx.drawImage(orbSprite(o.c), o.x - r * 1.6, o.y - r * 1.6, r * 3.2, r * 3.2);
    }
    for (const c of critters) {
      if (c.trail.length >= 4) {
        drawSnake(ctx, new Float32Array(c.trail), c.skin, { radius: c.radius, time, boosting: false, alpha: 1, quality: 'high' });
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette(ctx, w, h, 0.5);
  };

  if (staticFrame) {
    draw(0);
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
    for (const c of critters) step(c, dt);
    draw(now);
  };
  requestAnimationFrame(frame);
}

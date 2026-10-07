import type { SkinDef } from '@snake/shared/site-config';

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgbStr = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
const lighten = (c: RGB, k: number): RGB => [clamp255(c[0] + (255 - c[0]) * k), clamp255(c[1] + (255 - c[1]) * k), clamp255(c[2] + (255 - c[2]) * k)];
const darken = (c: RGB, k: number): RGB => [clamp255(c[0] * (1 - k)), clamp255(c[1] * (1 - k)), clamp255(c[2] * (1 - k))];
const mix = (a: RGB, b: RGB, t: number): RGB => [clamp255(a[0] + (b[0] - a[0]) * t), clamp255(a[1] + (b[1] - a[1]) * t), clamp255(a[2] + (b[2] - a[2]) * t)];

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [clamp255(f(0) * 255), clamp255(f(8) * 255), clamp255(f(4) * 255)];
}

const SPRITE = 64;
const sprites = new Map<string, HTMLCanvasElement>();

function sprite(kind: 'ball' | 'neon' | 'glow' | 'spot', c: RGB): HTMLCanvasElement {
  const key = `${kind}${c[0]},${c[1]},${c[2]}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  if (sprites.size > 600) sprites.clear();
  cv = document.createElement('canvas');
  cv.width = cv.height = SPRITE;
  const g = cv.getContext('2d')!;
  const m = SPRITE / 2;
  let grad: CanvasGradient;
  if (kind === 'glow') {
    grad = g.createRadialGradient(m, m, 0, m, m, m);
    grad.addColorStop(0, rgbStr(c, 0.55));
    grad.addColorStop(0.45, rgbStr(c, 0.22));
    grad.addColorStop(1, rgbStr(c, 0));
  } else if (kind === 'neon') {
    grad = g.createRadialGradient(m * 0.85, m * 0.8, 0, m, m, m);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, rgbStr(lighten(c, 0.55)));
    grad.addColorStop(0.7, rgbStr(c));
    grad.addColorStop(1, rgbStr(darken(c, 0.25)));
  } else if (kind === 'spot') {
    grad = g.createRadialGradient(m, m, 0, m, m, m);
    grad.addColorStop(0, rgbStr(c));
    grad.addColorStop(0.75, rgbStr(c, 0.9));
    grad.addColorStop(1, rgbStr(c, 0));
  } else {
    grad = g.createRadialGradient(m * 0.72, m * 0.62, m * 0.05, m, m, m);
    grad.addColorStop(0, rgbStr(lighten(c, 0.6)));
    grad.addColorStop(0.32, rgbStr(lighten(c, 0.12)));
    grad.addColorStop(0.78, rgbStr(c));
    grad.addColorStop(1, rgbStr(darken(c, 0.35)));
  }
  g.fillStyle = grad;
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.fill();
  sprites.set(key, cv);
  return cv;
}

interface Prepared {
  rgb: RGB[];
}
const prepared = new WeakMap<SkinDef, Prepared>();
function prep(skin: SkinDef): Prepared {
  let p = prepared.get(skin);
  if (!p) {
    p = { rgb: skin.colors.map(hexToRgb) };
    prepared.set(skin, p);
  }
  return p;
}

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Resampled body: x, y, distance-from-head triples.
let buf = new Float32Array(3 * 1024);

function resample(points: Float32Array, step: number): number {
  let count = 0;
  const push = (x: number, y: number, d: number) => {
    if ((count + 1) * 3 > buf.length) {
      const next = new Float32Array(buf.length * 2);
      next.set(buf);
      buf = next;
    }
    buf[count * 3] = x;
    buf[count * 3 + 1] = y;
    buf[count * 3 + 2] = d;
    count++;
  };
  push(points[0], points[1], 0);
  let dist = 0;
  let carry = 0;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2], ay = points[i - 1];
    const dx = points[i] - ax, dy = points[i + 1] - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) continue;
    let t = step - carry;
    while (t <= len) {
      push(ax + (dx * t) / len, ay + (dy * t) / len, dist + t);
      t += step;
    }
    carry = len - (t - step);
    dist += len;
  }
  return count;
}

export interface DrawSnakeOptions {
  radius: number;
  time: number;
  boosting: boolean;
  alpha: number;
  quality: 'high' | 'low';
}

function colorAt(skin: SkinDef, p: Prepared, d: number, total: number, r: number, i: number, time: number): RGB {
  const c = p.rgb;
  switch (skin.pattern) {
    case 'bands':
      return c[Math.floor(d / (r * 1.7)) % c.length];
    case 'stripes':
      return Math.floor(d / (r * 0.95)) % 3 === 0 ? c[1 % c.length] : c[0];
    case 'gradient': {
      if (c.length === 1) return c[0];
      const t = Math.round(Math.min(1, d / Math.max(1, total)) * 16) / 16;
      const seg = t * (c.length - 1);
      const k = Math.min(c.length - 2, Math.floor(seg));
      return mix(c[k], c[k + 1], seg - k);
    }
    case 'rainbow':
      return hslToRgb(Math.round((((d * 0.5 - time * 0.09) % 360) + 360) % 360 / 12) * 12, 0.95, 0.58);
    case 'scales':
      return i % 2 === 0 ? c[0] : mix(c[0], c[2 % c.length], 0.35);
    case 'galaxy': {
      const t = (Math.sin(d * 0.02 + time * 0.0015) + 1) / 2;
      return mix(c[0], c[1 % c.length], Math.round(t * 8) / 8);
    }
    default:
      return c[0];
  }
}

/** Strokes the resampled body, splitting it where the width bucket changes (tail taper). */
function strokeRuns(ctx: CanvasRenderingContext2D, n: number, bucket: (d: number) => number, width: (k: number) => number): void {
  let i = n - 1;
  while (i > 0) {
    const k = bucket(buf[i * 3 + 2]);
    ctx.beginPath();
    ctx.moveTo(buf[i * 3], buf[i * 3 + 1]);
    let j = i - 1;
    for (; j >= 0; j--) {
      ctx.lineTo(buf[j * 3], buf[j * 3 + 1]);
      if (bucket(buf[j * 3 + 2]) !== k) break;
    }
    ctx.lineWidth = width(k);
    ctx.stroke();
    i = Math.max(0, j);
  }
}

export function drawSnake(ctx: CanvasRenderingContext2D, points: Float32Array, skin: SkinDef, o: DrawSnakeOptions): void {
  if (points.length < 4) return;
  const r = o.radius;
  const p = prep(skin);
  const step = Math.max(2.5, r * (o.quality === 'low' ? 0.7 : 0.42));
  const n = resample(points, step);
  const total = buf[(n - 1) * 3 + 2];
  const neon = skin.pattern === 'neon';
  const glow = (skin.glow || neon || o.boosting) && (o.quality === 'high' || o.boosting);

  ctx.globalAlpha = o.alpha;

  if (glow) {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const gr = r * (o.boosting ? 3.4 : 2.6);
    const every = o.quality === 'low' ? 4 : 2;
    for (let i = n - 1; i >= 0; i -= every) {
      const c = colorAt(skin, p, buf[i * 3 + 2], total, r, i, o.time);
      ctx.drawImage(sprite('glow', c), buf[i * 3] - gr, buf[i * 3 + 1] - gr, gr * 2, gr * 2);
    }
    ctx.globalCompositeOperation = prev;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const taperStart = total - r * 6;
  const widthAt = (d: number) => (d > taperStart ? 0.5 + 0.5 * Math.max(0, (total - d) / (r * 6)) : 1);

  // 1. Dark outline gives the body a defined edge.
  const base = p.rgb[0];
  ctx.strokeStyle = rgbStr(darken(base, neon ? 0.2 : 0.55));
  strokeRuns(ctx, n, (d) => Math.round(widthAt(d) * 4), (k) => (r * 2 + 3) * (k / 4));

  // 2. Body colour, drawn tail to head in runs of equal colour so band edges stay round.
  let runStart = n - 1;
  let runColor = colorAt(skin, p, buf[runStart * 3 + 2], total, r, runStart, o.time);
  let runW = Math.round(widthAt(buf[runStart * 3 + 2]) * 4);
  for (let i = n - 2; i >= -1; i--) {
    const c = i >= 0 ? colorAt(skin, p, buf[i * 3 + 2], total, r, i, o.time) : null;
    const w = i >= 0 ? Math.round(widthAt(buf[i * 3 + 2]) * 4) : -1;
    if (!c || c[0] !== runColor[0] || c[1] !== runColor[1] || c[2] !== runColor[2] || w !== runW) {
      const from = Math.max(0, i);
      ctx.beginPath();
      ctx.moveTo(buf[runStart * 3], buf[runStart * 3 + 1]);
      for (let j = runStart - 1; j >= from; j--) ctx.lineTo(buf[j * 3], buf[j * 3 + 1]);
      if (from === runStart) ctx.lineTo(buf[from * 3] + 0.01, buf[from * 3 + 1]);
      ctx.strokeStyle = rgbStr(runColor);
      ctx.lineWidth = r * 2 * (runW / 4);
      ctx.stroke();
      if (c) {
        runStart = i;
        runColor = c;
        runW = w;
      }
    }
  }

  // 3. Pattern details on top of the base colour.
  if (o.quality === 'high') {
    for (let i = n - 1; i >= 1; i--) {
      const x = buf[i * 3], y = buf[i * 3 + 1], d = buf[i * 3 + 2];
      const rr = r * widthAt(d);
      if (skin.pattern === 'scales') {
        if (Math.floor(d / (r * 2.4)) % 2 === 0 && i % 2 === 0) {
          const sr = rr * 0.62;
          ctx.drawImage(sprite('spot', p.rgb[1 % p.rgb.length]), x - sr, y - sr, sr * 2, sr * 2);
        }
        if (i % 2 === 1) {
          const j = Math.max(0, i - 1);
          const ang = Math.atan2(buf[j * 3 + 1] - y, buf[j * 3] - x);
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = Math.max(0.8, r * 0.08);
          for (const side of [-0.5, 0.5]) {
            const ox = x + Math.cos(ang + Math.PI / 2) * side * rr;
            const oy = y + Math.sin(ang + Math.PI / 2) * side * rr;
            ctx.beginPath();
            ctx.arc(ox, oy, rr * 0.38, ang - 1.2, ang + 1.2);
            ctx.stroke();
          }
        }
      } else if (skin.pattern === 'spots' && i % 3 === 0) {
        const seed = Math.floor(d / (r * 1.1));
        if (hash(seed) > 0.35) {
          const j = Math.max(1, i - 1);
          const ang = Math.atan2(buf[j * 3 + 1] - y, buf[j * 3] - x) + Math.PI / 2;
          const off = (hash(seed + 7) - 0.5) * rr * 1.1;
          const sr = rr * (0.22 + hash(seed + 3) * 0.2);
          ctx.drawImage(sprite('spot', p.rgb[1 % p.rgb.length]), x + Math.cos(ang) * off - sr, y + Math.sin(ang) * off - sr, sr * 2, sr * 2);
        }
      } else if (skin.pattern === 'galaxy' && i % 3 === 0) {
        const seed = Math.floor(d / 7);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(o.time * 0.004 + seed));
        ctx.fillStyle = `rgba(255,255,255,${(tw * 0.9).toFixed(2)})`;
        const sx = x + (hash(seed) - 0.5) * rr;
        const sy = y + (hash(seed + 1) - 0.5) * rr;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }
  }

  // 4. Tube shading: a shadow on the lower right and highlights on the upper left.
  const trace = (dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(buf[(n - 1) * 3] + dx, buf[(n - 1) * 3 + 1] + dy);
    for (let i = n - 2; i >= 0; i--) ctx.lineTo(buf[i * 3] + dx, buf[i * 3 + 1] + dy);
  };
  if (neon) {
    trace(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = r * 0.55;
    ctx.stroke();
  } else {
    trace(r * 0.32, r * 0.32);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = r * 1.15;
    ctx.stroke();
    trace(-r * 0.22, -r * 0.22);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = r * 1.0;
    ctx.stroke();
    if (o.quality === 'high') {
      trace(-r * 0.36, -r * 0.36);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = r * 0.32;
      ctx.stroke();
    }
  }

  const nx = n > 1 ? buf[3] : points[2];
  const ny = n > 1 ? buf[4] : points[3];
  drawHead(ctx, buf[0], buf[1], nx, ny, skin, r, o, colorAt(skin, p, 0, total, r, 0, o.time));
  ctx.globalAlpha = 1;
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  nx: number,
  ny: number,
  skin: SkinDef,
  r: number,
  o: DrawSnakeOptions,
  color: RGB
): void {
  let dx = hx - nx;
  let dy = hy - ny;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const px = -dy;
  const py = dx;
  const neon = skin.pattern === 'neon';

  if (skin.head === 'viper') {
    const tipX = hx + dx * r * 1.55, tipY = hy + dy * r * 1.55;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(hx + dx * r * 0.9 + px * r * 1.25, hy + dy * r * 0.9 + py * r * 1.25, hx - dx * r * 0.2 + px * r * 1.1, hy - dy * r * 0.2 + py * r * 1.1);
    ctx.quadraticCurveTo(hx - dx * r * 0.9 + px * r * 0.8, hy - dy * r * 0.9 + py * r * 0.8, hx - dx * r * 0.9, hy - dy * r * 0.9);
    ctx.quadraticCurveTo(hx - dx * r * 0.9 - px * r * 0.8, hy - dy * r * 0.9 - py * r * 0.8, hx - dx * r * 0.2 - px * r * 1.1, hy - dy * r * 0.2 - py * r * 1.1);
    ctx.quadraticCurveTo(hx + dx * r * 0.9 - px * r * 1.25, hy + dy * r * 0.9 - py * r * 1.25, tipX, tipY);
    const grad = ctx.createRadialGradient(hx + dx * r * 0.3 - px * r * 0.3, hy + dy * r * 0.3 - py * r * 0.3, r * 0.1, hx, hy, r * 1.6);
    grad.addColorStop(0, rgbStr(lighten(color, neon ? 0.6 : 0.45)));
    grad.addColorStop(0.6, rgbStr(color));
    grad.addColorStop(1, rgbStr(darken(color, 0.45)));
    ctx.fillStyle = grad;
    ctx.fill();

    const phase = (o.time % 1700) / 1700;
    if (phase < 0.16) {
      const out = Math.sin((phase / 0.16) * Math.PI) * r * 1.1;
      const bx = tipX, by = tipY;
      const ex = bx + dx * out, ey = by + dy * out;
      ctx.strokeStyle = '#e8304a';
      ctx.lineWidth = Math.max(1.2, r * 0.13);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex + (dx + px * 0.6) * r * 0.3, ey + (dy + py * 0.6) * r * 0.3);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + (dx - px * 0.6) * r * 0.3, ey + (dy - py * 0.6) * r * 0.3);
      ctx.stroke();
    }

    for (const side of [-1, 1]) {
      const ex = hx + dx * r * 0.45 + px * side * r * 0.62;
      const ey = hy + dy * r * 0.45 + py * side * r * 0.62;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.27, r * 0.2, Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(ex + dx * r * 0.04, ey + dy * r * 0.04, r * 0.05, r * 0.17, Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const hr = r * (skin.head === 'cute' ? 1.15 : 1.08);
  ctx.drawImage(sprite(neon ? 'neon' : 'ball', color), hx - hr, hy - hr, hr * 2, hr * 2);

  const cute = skin.head === 'cute';
  const eyeR = r * (cute ? 0.46 : 0.36);
  const pupilR = r * (cute ? 0.28 : 0.19);
  for (const side of [-1, 1]) {
    const ex = hx + dx * r * (cute ? 0.25 : 0.38) + px * side * r * (cute ? 0.5 : 0.48);
    const ey = hy + dy * r * (cute ? 0.25 : 0.38) + py * side * r * (cute ? 0.5 : 0.48);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10131f';
    ctx.beginPath();
    ctx.arc(ex + dx * eyeR * 0.35, ey + dy * eyeR * 0.35, pupilR, 0, Math.PI * 2);
    ctx.fill();
    if (cute) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + dx * eyeR * 0.15 - px * eyeR * 0.2, ey + dy * eyeR * 0.15 - py * eyeR * 0.2, pupilR * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,120,160,0.45)';
      ctx.beginPath();
      ctx.arc(hx - dx * r * 0.15 + px * side * r * 0.85, hy - dy * r * 0.15 + py * side * r * 0.85, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draws a gently waving demo snake filling the canvas (skin pickers, admin preview). */
export function drawSkinPreview(canvas: HTMLCanvasElement, skin: SkinDef, time: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(h * 0.17, 14);
  const pts: number[] = [];
  const len = w - r * 4;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = w - r * 2.2 - t * len;
    const y = h / 2 + Math.sin(t * Math.PI * 2.2 + time * 0.003) * h * 0.2;
    pts.push(x, y);
  }
  drawSnake(ctx, new Float32Array(pts), skin, { radius: r, time, boosting: false, alpha: 1, quality: 'high' });
}

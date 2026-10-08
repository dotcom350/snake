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
  key: string;
  rgb: RGB[];
}
const prepared = new WeakMap<SkinDef, Prepared>();
function prep(skin: SkinDef): Prepared {
  const key = skin.colors.join();
  let p = prepared.get(skin);
  if (!p || p.key !== key) {
    p = { key, rgb: skin.colors.map(hexToRgb) };
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


const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function colorAt(skin: SkinDef, p: Prepared, d: number, total: number, r: number, i: number, time: number): RGB {
  const c = p.rgb;
  const sc = skin.patternScale ?? 1;
  switch (skin.pattern) {
    case 'bands':
      return c[Math.floor(d / (r * 1.7 * sc)) % c.length];
    case 'stripes':
      return Math.floor(d / (r * 0.95 * sc)) % 3 === 0 ? c[1 % c.length] : c[0];
    case 'gradient': {
      if (c.length === 1) return c[0];
      const t = Math.round(Math.min(1, d / Math.max(1, total)) * 16) / 16;
      const seg = t * (c.length - 1);
      const k = Math.min(c.length - 2, Math.floor(seg));
      return mix(c[k], c[k + 1], seg - k);
    }
    case 'rainbow':
      return hslToRgb(Math.round((((d * 0.5 / sc - time * 0.09) % 360) + 360) % 360 / 12) * 12, 0.95, 0.58);
    case 'scales':
      return i % 2 === 0 ? c[0] : mix(c[0], c[2 % c.length], 0.35);
    case 'galaxy': {
      const t = (Math.sin(d * 0.02 / sc - time * 0.0015) + 1) / 2;
      return mix(c[0], c[1 % c.length], Math.round(t * 8) / 8);
    }
    case 'fire': {
      // Flames run from the head to the tail.
      const along = Math.min(1, d / Math.max(1, total));
      const flicker = (Math.sin(d * 0.07 / sc - time * 0.012) + 1) / 2;
      const t = Math.round(Math.min(1, along * 0.7 + flicker * 0.45) * 10) / 10;
      if (c.length === 1) return mix(c[0], WHITE, (1 - t) * 0.4);
      const seg = t * (c.length - 1);
      const k = Math.min(c.length - 2, Math.floor(seg));
      return mix(c[k], c[k + 1], seg - k);
    }
    case 'chrome': {
      const band = Math.pow(Math.abs(Math.sin(d * 0.09 / sc)), 3);
      const k = Math.round(band * 8) / 8;
      return k > 0.5 ? mix(c[0], WHITE, (k - 0.5) * 1.2) : mix(c[0], BLACK, (0.5 - k) * 0.5);
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

function bodyAngle(i: number): number {
  const j = Math.max(0, i - 1);
  const k = j === i ? Math.min(i + 1, buf.length / 3 - 1) : i;
  return Math.atan2(buf[j * 3 + 1] - buf[k * 3 + 1], buf[j * 3] - buf[k * 3]);
}

function drawOverlays(ctx: CanvasRenderingContext2D, skin: SkinDef, p: Prepared, n: number, r: number, widthAt: (d: number) => number, time: number): void {
  const sc = skin.patternScale ?? 1;
  const c1 = p.rgb[1 % p.rgb.length];
  const c2 = p.rgb[2 % p.rgb.length];
  for (let i = n - 1; i >= 1; i--) {
    const x = buf[i * 3], y = buf[i * 3 + 1], d = buf[i * 3 + 2];
    const prevD = buf[(i - 1) * 3 + 2];
    const rr = r * widthAt(d);
    const crosses = (period: number) => Math.floor(d / period) !== Math.floor(prevD / period);

    switch (skin.pattern) {
      case 'scales': {
        if (Math.floor(d / (r * 2.4 * sc)) % 2 === 0 && i % 2 === 0) {
          const sr = rr * 0.62;
          ctx.drawImage(sprite('spot', c1), x - sr, y - sr, sr * 2, sr * 2);
        }
        if (i % 2 === 1) {
          const ang = bodyAngle(i);
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
        break;
      }
      case 'diamonds': {
        if (!crosses(r * 2.3 * sc)) break;
        const ang = bodyAngle(i);
        const fx = Math.cos(ang), fy = Math.sin(ang);
        const along = Math.min(rr * 1.05, r * 1.1 * sc);
        const side = rr * 0.78;
        const shape = (k: number) => {
          ctx.beginPath();
          ctx.moveTo(x + fx * along * k, y + fy * along * k);
          ctx.lineTo(x - fy * side * k, y + fx * side * k);
          ctx.lineTo(x - fx * along * k, y - fy * along * k);
          ctx.lineTo(x + fy * side * k, y - fx * side * k);
          ctx.closePath();
        };
        shape(1);
        ctx.fillStyle = rgbStr(c1);
        ctx.fill();
        shape(0.55);
        ctx.fillStyle = rgbStr(c2);
        ctx.fill();
        break;
      }
      case 'dots': {
        if (!crosses(r * 1.25 * sc)) break;
        const ang = bodyAngle(i) + Math.PI / 2;
        const sideSign = Math.floor(d / (r * 1.25 * sc)) % 2 === 0 ? 1 : -1;
        const dr = rr * Math.min(0.32, 0.22 * sc + 0.06);
        ctx.fillStyle = rgbStr(c1);
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * sideSign * rr * 0.42, y + Math.sin(ang) * sideSign * rr * 0.42, dr, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'camo': {
        if (!crosses(r * 0.9 * sc)) break;
        const seed = Math.floor(d / (r * 0.9 * sc));
        const ang = bodyAngle(i) + Math.PI / 2;
        const color = p.rgb[1 + (Math.floor(hash(seed) * 10) % Math.max(1, p.rgb.length - 1))] ?? c1;
        const off = (hash(seed + 5) - 0.5) * rr * 0.9;
        const sr = rr * (0.4 + hash(seed + 9) * 0.35) * Math.min(1.6, sc);
        ctx.drawImage(sprite('spot', color), x + Math.cos(ang) * off - sr, y + Math.sin(ang) * off - sr, sr * 2, sr * 2);
        break;
      }
      case 'spots': {
        if (i % 3 !== 0) break;
        const seed = Math.floor(d / (r * 1.1 * sc));
        if (hash(seed) <= 0.35) break;
        const ang = bodyAngle(i) + Math.PI / 2;
        const off = (hash(seed + 7) - 0.5) * rr * 1.1;
        const sr = rr * (0.22 + hash(seed + 3) * 0.2) * Math.min(1.6, sc);
        ctx.drawImage(sprite('spot', c1), x + Math.cos(ang) * off - sr, y + Math.sin(ang) * off - sr, sr * 2, sr * 2);
        break;
      }
      case 'galaxy': {
        if (i % 3 !== 0) break;
        const seed = Math.floor(d / 7);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.004 + seed));
        ctx.fillStyle = `rgba(255,255,255,${(tw * 0.9).toFixed(2)})`;
        ctx.fillRect(x + (hash(seed) - 0.5) * rr - 1, y + (hash(seed + 1) - 0.5) * rr - 1, 2, 2);
        break;
      }
    }
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
  const shine = skin.shine ?? (skin.pattern === 'chrome' ? 1 : 0.6);

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
  ctx.strokeStyle = rgbStr(darken(p.rgb[0], neon ? 0.2 : 0.55));
  strokeRuns(ctx, n, (d) => Math.round(widthAt(d) * 12), (k) => (r * 2 + 3) * (k / 12));

  // 2. Body colour, drawn tail to head in runs of equal colour so band edges stay round.
  let runStart = n - 1;
  let runColor = colorAt(skin, p, buf[runStart * 3 + 2], total, r, runStart, o.time);
  let runW = Math.round(widthAt(buf[runStart * 3 + 2]) * 12);
  for (let i = n - 2; i >= -1; i--) {
    const c = i >= 0 ? colorAt(skin, p, buf[i * 3 + 2], total, r, i, o.time) : null;
    const w = i >= 0 ? Math.round(widthAt(buf[i * 3 + 2]) * 12) : -1;
    if (!c || c[0] !== runColor[0] || c[1] !== runColor[1] || c[2] !== runColor[2] || w !== runW) {
      const from = Math.max(0, i);
      ctx.beginPath();
      ctx.moveTo(buf[runStart * 3], buf[runStart * 3 + 1]);
      for (let j = runStart - 1; j >= from; j--) ctx.lineTo(buf[j * 3], buf[j * 3 + 1]);
      if (from === runStart) ctx.lineTo(buf[from * 3] + 0.01, buf[from * 3 + 1]);
      ctx.strokeStyle = rgbStr(runColor);
      ctx.lineWidth = r * 2 * (runW / 12);
      ctx.stroke();
      if (c) {
        runStart = i;
        runColor = c;
        runW = w;
      }
    }
  }

  // 3. Pattern details on top of the base colour.
  if (o.quality === 'high') drawOverlays(ctx, skin, p, n, r, widthAt, o.time);

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
    if (shine > 0) {
      trace(-r * 0.22, -r * 0.22);
      ctx.strokeStyle = `rgba(255,255,255,${(0.22 * shine).toFixed(3)})`;
      ctx.lineWidth = r * 1.0;
      ctx.stroke();
      if (o.quality === 'high') {
        trace(-r * 0.36, -r * 0.36);
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.85, 0.47 * shine).toFixed(3)})`;
        ctx.lineWidth = r * 0.32;
        ctx.stroke();
      }
    }
  }

  const nx = n > 1 ? buf[3] : points[2];
  const ny = n > 1 ? buf[4] : points[3];
  drawHead(ctx, buf[0], buf[1], nx, ny, skin, p, r, o, colorAt(skin, p, 0, total, r, 0, o.time));
  ctx.globalAlpha = 1;
}

interface HeadFrame {
  hx: number;
  hy: number;
  dx: number;
  dy: number;
  px: number;
  py: number;
  r: number;
}

function headPath(ctx: CanvasRenderingContext2D, f: HeadFrame, snout: number, width: number): { tipX: number; tipY: number } {
  const { hx, hy, dx, dy, px, py, r } = f;
  const tipX = hx + dx * r * snout, tipY = hy + dy * r * snout;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.quadraticCurveTo(hx + dx * r * 0.9 + px * r * width, hy + dy * r * 0.9 + py * r * width, hx - dx * r * 0.2 + px * r * (width - 0.15), hy - dy * r * 0.2 + py * r * (width - 0.15));
  ctx.quadraticCurveTo(hx - dx * r * 0.9 + px * r * 0.8, hy - dy * r * 0.9 + py * r * 0.8, hx - dx * r * 0.9, hy - dy * r * 0.9);
  ctx.quadraticCurveTo(hx - dx * r * 0.9 - px * r * 0.8, hy - dy * r * 0.9 - py * r * 0.8, hx - dx * r * 0.2 - px * r * (width - 0.15), hy - dy * r * 0.2 - py * r * (width - 0.15));
  ctx.quadraticCurveTo(hx + dx * r * 0.9 - px * r * width, hy + dy * r * 0.9 - py * r * width, tipX, tipY);
  return { tipX, tipY };
}

function fillHeadGradient(ctx: CanvasRenderingContext2D, f: HeadFrame, color: RGB, bright: boolean): void {
  const { hx, hy, dx, dy, px, py, r } = f;
  const grad = ctx.createRadialGradient(hx + dx * r * 0.3 - px * r * 0.3, hy + dy * r * 0.3 - py * r * 0.3, r * 0.1, hx, hy, r * 1.6);
  grad.addColorStop(0, rgbStr(lighten(color, bright ? 0.6 : 0.45)));
  grad.addColorStop(0.6, rgbStr(color));
  grad.addColorStop(1, rgbStr(darken(color, 0.45)));
  ctx.fillStyle = grad;
  ctx.fill();
}

function tongue(ctx: CanvasRenderingContext2D, f: HeadFrame, tipX: number, tipY: number, time: number): void {
  const phase = (time % 1700) / 1700;
  if (phase >= 0.16) return;
  const { dx, dy, px, py, r } = f;
  const out = Math.sin((phase / 0.16) * Math.PI) * r * 1.1;
  const ex = tipX + dx * out, ey = tipY + dy * out;
  ctx.strokeStyle = '#e8304a';
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex + (dx + px * 0.6) * r * 0.3, ey + (dy + py * 0.6) * r * 0.3);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + (dx - px * 0.6) * r * 0.3, ey + (dy - py * 0.6) * r * 0.3);
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, hx: number, hy: number, nx: number, ny: number, skin: SkinDef, p: Prepared, r: number, o: DrawSnakeOptions, color: RGB): void {
  let dx = hx - nx;
  let dy = hy - ny;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const f: HeadFrame = { hx, hy, dx, dy, px: -dy, py: dx, r };
  const neon = skin.pattern === 'neon';
  const c1 = p.rgb[1 % p.rgb.length];

  let eyeForward = 0.38, eyeSide = 0.48, eyeR = 0.36;
  const slitDefault = skin.head === 'viper' || skin.head === 'dragon' || skin.head === 'cobra';

  switch (skin.head) {
    case 'viper': {
      const { tipX, tipY } = headPath(ctx, f, 1.55, 1.25);
      fillHeadGradient(ctx, f, color, neon);
      tongue(ctx, f, tipX, tipY, o.time);
      eyeForward = 0.45; eyeSide = 0.62; eyeR = 0.27;
      break;
    }
    case 'dragon': {
      // Horns behind the head.
      for (const side of [-1, 1]) {
        const bx = hx - dx * r * 0.35 + f.px * side * r * 0.7;
        const by = hy - dy * r * 0.35 + f.py * side * r * 0.7;
        ctx.beginPath();
        ctx.moveTo(bx + dx * r * 0.25, by + dy * r * 0.25);
        ctx.quadraticCurveTo(bx - dx * r * 0.9 + f.px * side * r * 0.9, by - dy * r * 0.9 + f.py * side * r * 0.9, bx - dx * r * 1.6 + f.px * side * r * 0.5, by - dy * r * 1.6 + f.py * side * r * 0.5);
        ctx.quadraticCurveTo(bx - dx * r * 0.6 + f.px * side * r * 0.3, by - dy * r * 0.6 + f.py * side * r * 0.3, bx - dx * r * 0.3, by - dy * r * 0.3);
        ctx.closePath();
        ctx.fillStyle = '#efe3c8';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = Math.max(0.8, r * 0.06);
        ctx.stroke();
      }
      const { tipX, tipY } = headPath(ctx, f, 1.75, 1.2);
      fillHeadGradient(ctx, f, color, neon);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(tipX - dx * r * 0.35 + f.px * side * r * 0.22, tipY - dy * r * 0.35 + f.py * side * r * 0.22, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      tongue(ctx, f, tipX, tipY, o.time);
      eyeForward = 0.4; eyeSide = 0.6; eyeR = 0.27;
      break;
    }
    case 'cobra': {
      // Hood: wide flap behind the head with "spectacle" markings.
      const cx = hx - dx * r * 0.9, cy = hy - dy * r * 0.9;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.25, r * 2.0, Math.atan2(dy, dx), 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2);
      g.addColorStop(0, rgbStr(lighten(color, 0.2)));
      g.addColorStop(0.7, rgbStr(color));
      g.addColorStop(1, rgbStr(darken(color, 0.5)));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgbStr(c1);
      ctx.lineWidth = Math.max(1, r * 0.16);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + f.px * side * r * 0.75, cy + f.py * side * r * 0.75, r * 0.38, 0, Math.PI * 2);
        ctx.stroke();
      }
      const { tipX, tipY } = headPath(ctx, f, 1.35, 1.1);
      fillHeadGradient(ctx, f, color, neon);
      tongue(ctx, f, tipX, tipY, o.time);
      eyeForward = 0.4; eyeSide = 0.55; eyeR = 0.27;
      break;
    }
    case 'cute': {
      const hr = r * 1.15;
      ctx.drawImage(sprite(neon ? 'neon' : 'ball', color), hx - hr, hy - hr, hr * 2, hr * 2);
      eyeForward = 0.25; eyeSide = 0.5; eyeR = 0.46;
      ctx.fillStyle = 'rgba(255,120,160,0.45)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx - dx * r * 0.15 + f.px * side * r * 0.85, hy - dy * r * 0.15 + f.py * side * r * 0.85, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default: {
      const hr = r * 1.08;
      ctx.drawImage(sprite(neon ? 'neon' : 'ball', color), hx - hr, hy - hr, hr * 2, hr * 2);
    }
  }

  drawEyes(ctx, f, skin, color, eyeForward, eyeSide, eyeR, slitDefault, o.time);
  drawAccessory(ctx, f, skin, p, o.time);
}

function drawEyes(ctx: CanvasRenderingContext2D, f: HeadFrame, skin: SkinDef, body: RGB, fwd: number, side: number, size: number, slit: boolean, time: number): void {
  const { hx, hy, dx, dy, px, py, r } = f;
  const style = skin.eyes ?? 'normal';
  const ang = Math.atan2(dy, dx);
  if (skin.accessory === 'glasses') return;

  if (style === 'cyclops') {
    const ex = hx + dx * r * 0.35, ey = hy + dy * r * 0.35;
    const er = r * 0.55;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.eyeColor ?? '#2e7d32';
    ctx.beginPath();
    ctx.arc(ex + dx * er * 0.3, ey + dy * er * 0.3, er * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0d14';
    ctx.beginPath();
    ctx.arc(ex + dx * er * 0.4, ey + dy * er * 0.4, er * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + dx * er * 0.2 - px * er * 0.25, ey + dy * er * 0.2 - py * er * 0.25, er * 0.12, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const googly = style === 'googly';
  const eyeR = r * (googly ? Math.max(size, 0.44) : size);
  for (const s of [-1, 1]) {
    const ex = hx + dx * r * fwd + px * s * r * side;
    const ey = hy + dy * r * fwd + py * s * r * side;

    if (slit && style === 'normal') {
      ctx.fillStyle = skin.eyeColor ?? '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(ex, ey, eyeR, eyeR * 0.75, ang, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(ex + dx * r * 0.04, ey + dy * r * 0.04, eyeR * 0.2, eyeR * 0.65, ang, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
    let ox = dx * eyeR * 0.35, oy = dy * eyeR * 0.35;
    if (googly) {
      const a = time * 0.008 + s * 1.7;
      ox = Math.cos(a) * eyeR * 0.35;
      oy = Math.sin(a) * eyeR * 0.35;
    }
    const pr = eyeR * (googly ? 0.5 : 0.55);
    ctx.fillStyle = skin.eyeColor ?? '#10131f';
    ctx.beginPath();
    ctx.arc(ex + ox, ey + oy, pr, 0, Math.PI * 2);
    ctx.fill();
    if (skin.eyeColor) {
      ctx.fillStyle = '#0b0d14';
      ctx.beginPath();
      ctx.arc(ex + ox, ey + oy, pr * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(ex + ox - px * pr * 0.35 - dx * pr * 0.2, ey + oy - py * pr * 0.35 - dy * pr * 0.2, pr * 0.3, 0, Math.PI * 2);
    ctx.fill();

    if (style === 'sleepy') {
      // Eyelid covering the front half.
      ctx.fillStyle = rgbStr(darken(body, 0.15));
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR * 1.05, ang - Math.PI / 2 - 0.1, ang + Math.PI / 2 + 0.1, false);
      ctx.closePath();
      ctx.fill();
    } else if (style === 'angry') {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(1.2, r * 0.13);
      ctx.lineCap = 'round';
      const inner = { x: ex + dx * eyeR * 1.1 - px * s * eyeR * 0.2, y: ey + dy * eyeR * 1.1 - py * s * eyeR * 0.2 };
      const outer = { x: ex + dx * eyeR * 0.3 + px * s * eyeR * 1.1, y: ey + dy * eyeR * 0.3 + py * s * eyeR * 1.1 };
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }
  }
}

function drawAccessory(ctx: CanvasRenderingContext2D, f: HeadFrame, skin: SkinDef, p: Prepared, time: number): void {
  const { hx, hy, dx, dy, px, py, r } = f;
  const ang = Math.atan2(dy, dx);
  switch (skin.accessory) {
    case 'crown': {
      ctx.save();
      ctx.translate(hx - dx * r * 0.35, hy - dy * r * 0.35);
      ctx.rotate(ang + Math.PI / 2);
      const w = r * 1.3, h = r * 0.9;
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 4);
      ctx.lineTo(-w / 4, h / 8);
      ctx.lineTo(0, -h / 2);
      ctx.lineTo(w / 4, h / 8);
      ctx.lineTo(w / 2, -h / 4);
      ctx.lineTo(w / 2, h / 2);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, '#fff3b0');
      g.addColorStop(1, '#d4a017');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#8a6400';
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#e53935';
      ctx.beginPath();
      ctx.arc(0, h * 0.2, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'horns': {
      for (const s of [-1, 1]) {
        const bx = hx - dx * r * 0.1 + px * s * r * 0.55;
        const by = hy - dy * r * 0.1 + py * s * r * 0.55;
        ctx.beginPath();
        ctx.moveTo(bx - dx * r * 0.2 - px * s * r * 0.15, by - dy * r * 0.2 - py * s * r * 0.15);
        ctx.quadraticCurveTo(bx + px * s * r * 0.9, by + py * s * r * 0.9, bx - dx * r * 0.9 + px * s * r * 1.1, by - dy * r * 0.9 + py * s * r * 1.1);
        ctx.quadraticCurveTo(bx + px * s * r * 0.35, by + py * s * r * 0.35, bx + dx * r * 0.2, by + dy * r * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#2b2b2b';
        ctx.fill();
      }
      break;
    }
    case 'hat': {
      const cx = hx - dx * r * 0.3, cy = hy - dy * r * 0.3;
      ctx.fillStyle = '#1b1b1f';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c2c33';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgbStr(p.rgb[1 % p.rgb.length]);
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'bow': {
      const cx = hx - dx * r * 0.75 + px * r * 0.55, cy = hy - dy * r * 0.75 + py * r * 0.55;
      ctx.fillStyle = '#ff4fa3';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + px * s * r * 0.6 + dx * r * 0.35, cy + py * s * r * 0.6 + dy * r * 0.35);
        ctx.lineTo(cx + px * s * r * 0.6 - dx * r * 0.35, cy + py * s * r * 0.6 - dy * r * 0.35);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#c2185b';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'glasses': {
      const fwd = skin.head === 'cute' ? 0.25 : 0.42;
      const side = skin.head === 'viper' || skin.head === 'dragon' ? 0.6 : 0.5;
      const lr = r * 0.38;
      const pts = [-1, 1].map((s) => ({ x: hx + dx * r * fwd + px * s * r * side, y: hy + dy * r * fwd + py * s * r * side }));
      ctx.fillStyle = '#111';
      for (const q of pts) {
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, lr, lr * 0.8, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120,200,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(q.x - px * lr * 0.3, q.y - py * lr * 0.3, lr * 0.35, lr * 0.2, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
      }
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
      break;
    }
    case 'antenna': {
      const ball = skin.eyeColor ?? rgbStr(p.rgb[1 % p.rgb.length]);
      for (const s of [-1, 1]) {
        const wob = Math.sin(time * 0.006 + s) * r * 0.15;
        const bx = hx - dx * r * 0.2 + px * s * r * 0.35, by = hy - dy * r * 0.2 + py * s * r * 0.35;
        const ex = bx - dx * r * 1.1 + px * (s * r * 0.7 + wob), ey = by - dy * r * 1.1 + py * (s * r * 0.7 + wob);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.fillStyle = ball;
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

/** Draws a demo snake swimming in place (skin pickers, admin preview). */
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
  ctx.save();
  ctx.translate(0, h / 2);
  drawSnake(ctx, swimPath(w - r * 2.6, r * 1.6, h * 0.2, time), skin, { radius: r, time, boosting: false, alpha: 1, quality: 'high' });
  ctx.restore();
}

/**
 * Points of a snake swimming to the right in place: the wave starts at the head
 * and travels towards the tail, like a real snake moving forward.
 */
export function swimPath(headX: number, tailX: number, amplitude: number, time: number): Float32Array {
  const pts: number[] = [];
  const len = headX - tailX;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const fade = 0.35 + 0.65 * t;
    pts.push(headX - t * len, Math.sin(t * Math.PI * 2.2 - time * 0.004) * amplitude * fade);
  }
  return new Float32Array(pts);
}

import type { ErrorCode } from './types.js';

export const PROTOCOL_VERSION = 2;
export const MSG_STATE = 1;

export const NICKNAME_MAX = 16;
export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.\-]{1,16}$/u;

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

export function isValidNickname(nickname: string): boolean {
  return NICKNAME_PATTERN.test(nickname);
}

export function snakeRadius(mass: number): number {
  return Math.min(30, 9 + Math.sqrt(mass) * 0.55);
}

export function foodRadius(size: number): number {
  return 3 + size * 1.6;
}

export type Device = 'm' | 'd';

export type ClientMessage =
  | { type: 'join'; nickname: string; sessionId: string; skin: number; d: Device; l: 'en' | 'es' }
  | { type: 'input'; a: number; b: boolean };

/** [id, nickname] */
export type MetaPlayer = [number, string];
/** [nickname, score, isMe] */
export type MetaTopEntry = [string, number, boolean];

export type ServerMessage =
  | { type: 'joined'; id: number; arena: { w: number; h: number }; tickHz: number }
  | { type: 'meta'; players: MetaPlayer[]; top: MetaTopEntry[]; rank: number; count: number }
  | { type: 'died'; score: number; killer: string | null; reason: 'snake' | 'wall' }
  | { type: 'kill'; name: string }
  | { type: 'error'; code: ErrorCode };

export interface EncodableSnake {
  id: number;
  skin: number;
  boosting: boolean;
  protected: boolean;
  mass: number;
  /** Increases by one every time a new head point is added. */
  seq: number;
  /** Head first. */
  points: ReadonlyArray<{ x: number; y: number }>;
}

export interface EncodableFood {
  x: number;
  y: number;
  size: number;
  color: number;
}

export interface DecodedSnake {
  id: number;
  skin: number;
  boosting: boolean;
  protected: boolean;
  mass: number;
  /** Flat x,y pairs, head first. */
  points: Float32Array;
}

export interface DecodedState {
  tick: number;
  selfId: number;
  snakes: DecodedSnake[];
  /** Flat x,y,size,color quadruples. */
  food: Float32Array;
}

const I16_MIN = -32768;
const I16_MAX = 32767;
const clampI16 = (v: number) => Math.max(I16_MIN, Math.min(I16_MAX, Math.round(v)));

// Body points are fixed trail positions; sending every other one (aligned to
// seq so the same points are chosen each tick) halves bandwidth without jitter.
function sampledIndices(s: EncodableSnake, out: number[]): number[] {
  out.length = 0;
  const n = s.points.length;
  if (n === 0) return out;
  out.push(0);
  for (let i = 1; i < n - 1; i++) {
    if (((s.seq - i) & 1) === 0) out.push(i);
  }
  if (n > 1) out.push(n - 1);
  return out;
}

export function encodeState(
  tick: number,
  selfId: number,
  snakes: ReadonlyArray<EncodableSnake>,
  food: ReadonlyArray<EncodableFood>
): Uint8Array {
  const snakeCount = Math.min(snakes.length, 0xffff);
  const foodCount = Math.min(food.length, 0xffff);
  const indices: number[][] = [];
  let size = 1 + 4 + 2 + 2 + 2;
  for (let i = 0; i < snakeCount; i++) {
    const idx = sampledIndices(snakes[i], []);
    indices.push(idx);
    size += 2 + 1 + 1 + 2 + 2 + idx.length * 4;
  }
  size += foodCount * 5;

  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint8(o, MSG_STATE); o += 1;
  v.setUint32(o, tick >>> 0, true); o += 4;
  v.setUint16(o, selfId, true); o += 2;
  v.setUint16(o, snakeCount, true); o += 2;

  for (let i = 0; i < snakeCount; i++) {
    const s = snakes[i];
    const idx = indices[i];
    v.setUint16(o, s.id, true); o += 2;
    v.setUint8(o, s.skin & 0xff); o += 1;
    v.setUint8(o, (s.boosting ? 1 : 0) | (s.protected ? 2 : 0)); o += 1;
    v.setUint16(o, Math.min(0xffff, Math.max(0, Math.round(s.mass))), true); o += 2;
    v.setUint16(o, idx.length, true); o += 2;
    for (const j of idx) {
      const p = s.points[j];
      v.setInt16(o, clampI16(p.x), true); o += 2;
      v.setInt16(o, clampI16(p.y), true); o += 2;
    }
  }

  v.setUint16(o, foodCount, true); o += 2;
  for (let i = 0; i < foodCount; i++) {
    const f = food[i];
    v.setInt16(o, clampI16(f.x), true); o += 2;
    v.setInt16(o, clampI16(f.y), true); o += 2;
    v.setUint8(o, ((f.size & 0x0f) << 4) | (f.color & 0x0f)); o += 1;
  }

  return out;
}

export function decodeState(buffer: ArrayBuffer): DecodedState {
  const v = new DataView(buffer);
  let o = 0;
  if (v.getUint8(o) !== MSG_STATE) throw new Error('Unknown message type');
  o += 1;
  const tick = v.getUint32(o, true); o += 4;
  const selfId = v.getUint16(o, true); o += 2;
  const snakeCount = v.getUint16(o, true); o += 2;

  const snakes: DecodedSnake[] = new Array(snakeCount);
  for (let i = 0; i < snakeCount; i++) {
    const id = v.getUint16(o, true); o += 2;
    const skin = v.getUint8(o); o += 1;
    const flags = v.getUint8(o); o += 1;
    const mass = v.getUint16(o, true); o += 2;
    const n = v.getUint16(o, true); o += 2;
    const points = new Float32Array(n * 2);
    for (let j = 0; j < n; j++) {
      points[j * 2] = v.getInt16(o, true); o += 2;
      points[j * 2 + 1] = v.getInt16(o, true); o += 2;
    }
    snakes[i] = { id, skin, boosting: (flags & 1) !== 0, protected: (flags & 2) !== 0, mass, points };
  }

  const foodCount = v.getUint16(o, true); o += 2;
  const food = new Float32Array(foodCount * 4);
  for (let i = 0; i < foodCount; i++) {
    food[i * 4] = v.getInt16(o, true); o += 2;
    food[i * 4 + 1] = v.getInt16(o, true); o += 2;
    const b = v.getUint8(o); o += 1;
    food[i * 4 + 2] = b >> 4;
    food[i * 4 + 3] = b & 0x0f;
  }

  return { tick, selfId, snakes, food };
}

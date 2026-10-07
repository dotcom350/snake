import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, isValidNickname, normalizeNickname } from './protocol.js';

const toArrayBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('state codec', () => {
  it('round-trips snakes and food, keeping head and tail', () => {
    const points = Array.from({ length: 9 }, (_, i) => ({ x: 100 - i * 8, y: 50 }));
    const bytes = encodeState(
      42,
      7,
      [{ id: 7, skin: 3, boosting: true, protected: false, mass: 25.4, seq: 100, points }],
      [{ x: 10, y: 20, size: 2, color: 5 }]
    );
    const s = decodeState(toArrayBuffer(bytes));
    expect(s.tick).toBe(42);
    expect(s.selfId).toBe(7);
    expect(s.snakes[0]).toMatchObject({ id: 7, skin: 3, boosting: true, protected: false, mass: 25 });
    const p = s.snakes[0].points;
    expect([p[0], p[1]]).toEqual([100, 50]);
    expect([p[p.length - 2], p[p.length - 1]]).toEqual([36, 50]);
    expect(p.length / 2).toBeLessThan(points.length);
    expect(Array.from(s.food)).toEqual([10, 20, 2, 5]);
  });

  it('supports more than 255 food items', () => {
    const food = Array.from({ length: 600 }, (_, i) => ({ x: i, y: i, size: 1, color: 0 }));
    const s = decodeState(toArrayBuffer(encodeState(1, 0, [], food)));
    expect(s.food.length / 4).toBe(600);
  });
});

describe('nicknames', () => {
  it('accepts accents and ñ, rejects markup', () => {
    expect(isValidNickname(normalizeNickname('  Peña   Ñandú '))).toBe(true);
    expect(isValidNickname('<b>x</b>')).toBe(false);
    expect(isValidNickname('')).toBe(false);
  });
});

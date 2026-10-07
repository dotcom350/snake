// Binary codec for compact game state transmission
// Reduces bandwidth significantly for low-resource environments

export class BinaryCodec {
  static encodeGameState(
    tick: number,
    snakes: Array<{
      id: string;
      segments: Array<[number, number]>;
      mass: number;
      boosting: boolean;
      protected: boolean;
    }>,
    food: Array<{ id: string; x: number; y: number }>
  ): ArrayBuffer {
    // Estimate size: tick(4) + snake_count(1) + snakes(~20 bytes each) + food_count(1) + food(~8 bytes each)
    const maxSize =
      4 + 1 + snakes.length * 50 + 1 + food.length * 10 + 2;
    const buffer = new ArrayBuffer(maxSize);
    const view = new DataView(buffer);

    let offset = 0;

    // Tick (4 bytes, uint32)
    view.setUint32(offset, tick, true);
    offset += 4;

    // Snake count (1 byte)
    view.setUint8(offset, snakes.length);
    offset += 1;

    for (const snake of snakes) {
      // ID hash (simple sum of char codes, 2 bytes)
      const idHash =
        snake.id.charCodeAt(0) * 256 +
        snake.id.charCodeAt(Math.floor(snake.id.length / 2));
      view.setUint16(offset, idHash, true);
      offset += 2;

      // Mass (2 bytes, uint16, capped at 65535)
      view.setUint16(offset, Math.min(Math.round(snake.mass), 65535), true);
      offset += 2;

      // Flags (1 byte: boosting + protected)
      const flags = (snake.boosting ? 1 : 0) | (snake.protected ? 2 : 0);
      view.setUint8(offset, flags);
      offset += 1;

      // Segment count (1 byte)
      view.setUint8(offset, snake.segments.length);
      offset += 1;

      // Segments (4 bytes per segment: x, y as int16)
      for (const [x, y] of snake.segments) {
        view.setInt16(offset, Math.round(x), true);
        offset += 2;
        view.setInt16(offset, Math.round(y), true);
        offset += 2;
      }
    }

    // Food count (1 byte)
    view.setUint8(offset, food.length);
    offset += 1;

    for (const f of food) {
      // ID hash (2 bytes)
      const idHash = f.id.charCodeAt(0) * 256 + (f.id.charCodeAt(1) || 0);
      view.setUint16(offset, idHash, true);
      offset += 2;

      // Position (4 bytes: x, y as int16)
      view.setInt16(offset, Math.round(f.x), true);
      offset += 2;
      view.setInt16(offset, Math.round(f.y), true);
      offset += 2;
    }

    return buffer.slice(0, offset);
  }

  static decodeGameState(
    buffer: ArrayBuffer
  ): {
    tick: number;
    snakes: Array<{
      idHash: number;
      segments: Array<[number, number]>;
      mass: number;
      boosting: boolean;
      protected: boolean;
    }>;
    food: Array<{ idHash: number; x: number; y: number }>;
  } {
    const view = new DataView(buffer);
    let offset = 0;

    const tick = view.getUint32(offset, true);
    offset += 4;

    const snakeCount = view.getUint8(offset);
    offset += 1;

    const snakes = [];
    for (let i = 0; i < snakeCount; i++) {
      const idHash = view.getUint16(offset, true);
      offset += 2;

      const mass = view.getUint16(offset, true);
      offset += 2;

      const flags = view.getUint8(offset);
      offset += 1;

      const boosting = (flags & 1) !== 0;
      const protected_ = (flags & 2) !== 0;

      const segmentCount = view.getUint8(offset);
      offset += 1;

      const segments: Array<[number, number]> = [];
      for (let j = 0; j < segmentCount; j++) {
        const x = view.getInt16(offset, true);
        offset += 2;
        const y = view.getInt16(offset, true);
        offset += 2;
        segments.push([x, y]);
      }

      snakes.push({
        idHash,
        segments,
        mass,
        boosting,
        protected: protected_,
      });
    }

    const foodCount = view.getUint8(offset);
    offset += 1;

    const food = [];
    for (let i = 0; i < foodCount; i++) {
      const idHash = view.getUint16(offset, true);
      offset += 2;

      const x = view.getInt16(offset, true);
      offset += 2;
      const y = view.getInt16(offset, true);
      offset += 2;

      food.push({ idHash, x, y });
    }

    return { tick, snakes, food };
  }
}

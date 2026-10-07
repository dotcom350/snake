export class CellGrid<T extends { x: number; y: number }> {
  private readonly cells = new Map<number, Set<T>>();
  private readonly cellOf = new Map<T, number>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  private keyFor(x: number, y: number): number {
    return this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  insert(obj: T): void {
    const k = this.keyFor(obj.x, obj.y);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = new Set();
      this.cells.set(k, cell);
    }
    cell.add(obj);
    this.cellOf.set(obj, k);
  }

  remove(obj: T): void {
    const k = this.cellOf.get(obj);
    if (k === undefined) return;
    const cell = this.cells.get(k);
    if (cell) {
      cell.delete(obj);
      if (cell.size === 0) this.cells.delete(k);
    }
    this.cellOf.delete(obj);
  }

  forEachNear(x: number, y: number, radius: number, cb: (obj: T) => void): void {
    const r2 = radius * radius;
    const x0 = Math.floor((x - radius) / this.cellSize);
    const x1 = Math.floor((x + radius) / this.cellSize);
    const y0 = Math.floor((y - radius) / this.cellSize);
    const y1 = Math.floor((y + radius) / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const obj of cell) {
          const dx = obj.x - x;
          const dy = obj.y - y;
          if (dx * dx + dy * dy <= r2) cb(obj);
        }
      }
    }
  }

  /** Rectangular query without the distance check. */
  forEachInRect(minX: number, minY: number, maxX: number, maxY: number, cb: (obj: T) => void): void {
    const x0 = Math.floor(minX / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const y0 = Math.floor(minY / this.cellSize);
    const y1 = Math.floor(maxY / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const obj of cell) cb(obj);
      }
    }
  }
}

/** Rebuilt every tick; stores [snakeId, pointIndex] pairs per cell. */
export class BodyGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly used: number[][] = [];

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  clear(): void {
    for (const arr of this.used) arr.length = 0;
    this.used.length = 0;
  }

  add(x: number, y: number, snakeId: number, index: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    if (arr.length === 0) this.used.push(arr);
    arr.push(snakeId, index);
  }

  forEachNear(x: number, y: number, radius: number, cb: (snakeId: number, index: number) => void): void {
    const x0 = Math.floor((x - radius) / this.cellSize);
    const x1 = Math.floor((x + radius) / this.cellSize);
    const y0 = Math.floor((y - radius) / this.cellSize);
    const y1 = Math.floor((y + radius) / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) cb(arr[i], arr[i + 1]);
      }
    }
  }
}

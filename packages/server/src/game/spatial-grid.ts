// Spatial index for efficient collision detection

export class SpatialGrid<T extends { x: number; y: number }> {
  private cells: Map<string, Set<T>>;
  private cellSize: number;
  private objects: Map<T, string>;

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.objects = new Map();
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  insert(obj: T): void {
    const key = this.getCellKey(obj.x, obj.y);

    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }

    this.cells.get(key)!.add(obj);
    this.objects.set(obj, key);
  }

  remove(obj: T): void {
    const key = this.objects.get(obj);
    if (key && this.cells.has(key)) {
      this.cells.get(key)!.delete(obj);
      if (this.cells.get(key)!.size === 0) {
        this.cells.delete(key);
      }
    }
    this.objects.delete(obj);
  }

  update(obj: T): void {
    this.remove(obj);
    this.insert(obj);
  }

  getNearby(x: number, y: number, radius: number): T[] {
    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellY = Math.floor((y - radius) / this.cellSize);
    const maxCellY = Math.floor((y + radius) / this.cellSize);

    const nearby: T[] = [];

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = `${cx},${cy}`;
        const cell = this.cells.get(key);
        if (cell) {
          for (const obj of cell) {
            const dx = obj.x - x;
            const dy = obj.y - y;
            if (dx * dx + dy * dy <= radius * radius) {
              nearby.push(obj);
            }
          }
        }
      }
    }

    return nearby;
  }

  clear(): void {
    this.cells.clear();
    this.objects.clear();
  }
}

import { randomUUID } from 'crypto';
import { snakeRadius, foodRadius } from '@snake/shared';
import { CellGrid, BodyGrid } from './spatial-grid.js';
import { createChildLogger } from '../logger.js';
import { config } from '../config.js';
import { gameConfig, enabledSkinIds, settings } from '../settings.js';

const logger = createChildLogger('game');

const TURN_RATE = 4.2;
const MIN_BOOST_MASS = 14;
const POINT_SPACING_GUESS = 9;
const BOT_NAMES = [
  'Viper', 'Cobra', 'Mamba', 'Python', 'Boa', 'Kraken', 'Noodle', 'Slinky', 'Zigzag', 'Pixel',
  'Nova', 'Blaze', 'Shadow', 'Neon', 'Turbo', 'Wiggles', 'Sssam', 'Medusa', 'Rattle', 'Comet',
];

export interface Point {
  x: number;
  y: number;
}

export interface Snake {
  id: number;
  sessionId: string;
  nickname: string;
  isBot: boolean;
  points: Point[];
  seq: number;
  angle: number;
  targetAngle: number;
  mass: number;
  wantsBoost: boolean;
  boosting: boolean;
  boostDrop: number;
  protectedUntil: number;
  protected: boolean;
  skin: number;
  kills: number;
  bornAt: number;
  peakMass: number;
  device: 'm' | 'd';
  lang: 'en' | 'es';
  thinkOffset: number;
}

export interface Food {
  id: number;
  x: number;
  y: number;
  size: number;
  color: number;
}

export interface DeathEvent {
  snake: Snake;
  score: number;
  killer: Snake | null;
  reason: 'snake' | 'wall';
}

const TWO_PI = Math.PI * 2;

function normAngle(a: number): number {
  a = (a + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

function foodColorCount(): number {
  return Math.max(1, Math.min(16, settings().appearance.foodColors.length));
}

function randomSkin(): number {
  const ids = enabledSkinIds();
  return ids[Math.floor(Math.random() * ids.length)];
}

function targetLength(mass: number): number {
  return Math.min(40 + mass * 4, config.resourceConfig.maxSnakeLength * POINT_SPACING_GUESS);
}

export class Room {
  readonly id = randomUUID();
  readonly createdAt = Date.now();
  readonly width = gameConfig().arenaSize;
  readonly height = gameConfig().arenaSize;
  lastHumanAt = Date.now();
  tickCount = 0;
  readonly snakes = new Map<number, Snake>();
  readonly food = new Map<number, Food>();

  private nextSnakeId = 1;
  private nextFoodId = 1;
  private readonly foodGrid = new CellGrid<Food>(128);
  private readonly bodyGrid = new BodyGrid(64);
  private deaths: DeathEvent[] = [];
  private botRespawnAt = 0;
  private get foodTarget(): number {
    return Math.floor(gameConfig().foodPerRoom * 0.85);
  }
  private get foodHardCap(): number {
    return gameConfig().foodPerRoom * 2;
  }

  constructor() {
    while (this.food.size < this.foodTarget) this.spawnFood();
  }

  humanCount(): number {
    let n = 0;
    for (const s of this.snakes.values()) if (!s.isBot) n++;
    return n;
  }

  botCount(): number {
    return this.snakes.size - this.humanCount();
  }

  addPlayer(sessionId: string, nickname: string, skin: number, device: 'm' | 'd', lang: 'en' | 'es'): Snake {
    this.lastHumanAt = Date.now();
    const s = this.spawnSnake(sessionId, nickname, false, gameConfig().startMass, skin);
    s.device = device;
    s.lang = lang;
    return s;
  }

  removeSnake(id: number): Snake | undefined {
    const s = this.snakes.get(id);
    this.snakes.delete(id);
    return s;
  }

  setInput(id: number, angle: number, boost: boolean): void {
    const s = this.snakes.get(id);
    if (!s) return;
    s.targetAngle = normAngle(angle);
    s.wantsBoost = boost;
  }

  takeDeaths(): DeathEvent[] {
    const d = this.deaths;
    this.deaths = [];
    return d;
  }

  leaderboard(): Snake[] {
    return Array.from(this.snakes.values()).sort((a, b) => b.mass - a.mass);
  }

  forEachFoodInRect(minX: number, minY: number, maxX: number, maxY: number, cb: (f: Food) => void): void {
    this.foodGrid.forEachInRect(minX, minY, maxX, maxY, cb);
  }

  private allocSnakeId(): number {
    for (let tries = 0; tries < 70000; tries++) {
      const id = this.nextSnakeId;
      this.nextSnakeId = this.nextSnakeId >= 65000 ? 1 : this.nextSnakeId + 1;
      if (!this.snakes.has(id)) return id;
    }
    throw new Error('No snake ids available');
  }

  private findSpawnPoint(): Point {
    const margin = 300;
    let best: Point = { x: this.width / 2, y: this.height / 2 };
    let bestScore = -1;
    for (let i = 0; i < 12; i++) {
      const p = {
        x: margin + Math.random() * (this.width - margin * 2),
        y: margin + Math.random() * (this.height - margin * 2),
      };
      let minD = Infinity;
      for (const s of this.snakes.values()) {
        for (let j = 0; j < s.points.length; j += 4) {
          const dx = s.points[j].x - p.x;
          const dy = s.points[j].y - p.y;
          minD = Math.min(minD, dx * dx + dy * dy);
        }
      }
      if (minD > bestScore) {
        bestScore = minD;
        best = p;
      }
      if (minD > 500 * 500) break;
    }
    return best;
  }

  private spawnSnake(sessionId: string, nickname: string, isBot: boolean, mass: number, skin: number): Snake {
    const now = Date.now();
    const head = this.findSpawnPoint();
    const toCenter = Math.atan2(this.height / 2 - head.y, this.width / 2 - head.x);
    const angle = toCenter + (Math.random() - 0.5) * 1.5;
    const len = targetLength(mass);
    const points: Point[] = [];
    for (let d = 0; d <= len; d += 8) {
      points.push({ x: head.x - Math.cos(angle) * d, y: head.y - Math.sin(angle) * d });
    }
    const snake: Snake = {
      id: this.allocSnakeId(),
      sessionId,
      nickname,
      isBot,
      points,
      seq: points.length,
      angle,
      targetAngle: angle,
      mass,
      wantsBoost: false,
      boosting: false,
      boostDrop: 0,
      protectedUntil: now + gameConfig().spawnProtectionMs,
      protected: true,
      skin,
      kills: 0,
      bornAt: now,
      peakMass: mass,
      device: 'd',
      lang: 'en',
      thinkOffset: Math.floor(Math.random() * 4),
    };
    this.snakes.set(snake.id, snake);
    return snake;
  }

  private addFood(x: number, y: number, size: number, color: number): void {
    if (this.food.size >= this.foodHardCap) return;
    x = Math.max(10, Math.min(this.width - 10, x));
    y = Math.max(10, Math.min(this.height - 10, y));
    const f: Food = { id: this.nextFoodId++, x, y, size, color };
    if (this.nextFoodId > 1e9) this.nextFoodId = 1;
    this.food.set(f.id, f);
    this.foodGrid.insert(f);
  }

  private spawnFood(): void {
    const size = Math.random() < 0.85 ? 1 : 2;
    this.addFood(
      20 + Math.random() * (this.width - 40),
      20 + Math.random() * (this.height - 40),
      size,
      Math.floor(Math.random() * foodColorCount())
    );
  }

  private removeFood(f: Food): void {
    this.food.delete(f.id);
    this.foodGrid.remove(f);
  }

  private kill(s: Snake, killer: Snake | null, reason: 'snake' | 'wall'): void {
    if (!this.snakes.has(s.id)) return;
    this.snakes.delete(s.id);
    if (killer) killer.kills++;

    const total = s.mass * 0.7;
    const count = Math.max(1, Math.min(120, Math.ceil(total / 3), s.points.length));
    const size = Math.max(1, Math.min(5, Math.round(total / count)));
    const step = s.points.length / count;
    const dropColor = Math.floor(Math.random() * foodColorCount());
    const r = snakeRadius(s.mass);
    for (let i = 0; i < count; i++) {
      const p = s.points[Math.floor(i * step)];
      this.addFood(p.x + (Math.random() - 0.5) * r * 1.6, p.y + (Math.random() - 0.5) * r * 1.6, size, dropColor);
    }

    this.deaths.push({ snake: s, score: Math.floor(s.peakMass), killer, reason });
  }

  private trim(s: Snake): void {
    const maxLen = targetLength(s.mass);
    const pts = s.points;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (acc + d >= maxLen) {
        const t = d > 0 ? (maxLen - acc) / d : 0;
        pts[i] = { x: pts[i - 1].x + dx * t, y: pts[i - 1].y + dy * t };
        pts.length = i + 1;
        return;
      }
      acc += d;
    }
  }

  tick(dt: number, now: number): void {
    this.tickCount++;
    const g = gameConfig();
    if (this.humanCount() > 0) this.lastHumanAt = now;

    for (const s of this.snakes.values()) {
      if (s.isBot && (this.tickCount + s.thinkOffset) % 4 === 0) this.think(s);

      const turn = (TURN_RATE / (1 + s.mass / 600)) * dt;
      const diff = normAngle(s.targetAngle - s.angle);
      s.angle = normAngle(s.angle + Math.max(-turn, Math.min(turn, diff)));

      s.boosting = s.wantsBoost && s.mass > MIN_BOOST_MASS;
      const speed = s.boosting ? g.boostSpeed : g.speed;
      const head = s.points[0];
      const nx = head.x + Math.cos(s.angle) * speed * dt;
      const ny = head.y + Math.sin(s.angle) * speed * dt;
      s.points.unshift({ x: nx, y: ny });
      s.seq++;

      if (s.boosting) {
        const cost = g.boostCost * dt;
        s.mass -= cost;
        s.boostDrop += cost * 0.6;
        if (s.boostDrop >= 2) {
          const tail = s.points[s.points.length - 1];
          this.addFood(tail.x, tail.y, 2, Math.floor(Math.random() * foodColorCount()));
          s.boostDrop -= 2;
        }
      }

      this.trim(s);
      s.protected = now < s.protectedUntil;

      const r = snakeRadius(s.mass);
      this.foodGrid.forEachNear(nx, ny, r + 20, (f) => {
        const reach = r + foodRadius(f.size) + 4;
        const dx = f.x - nx;
        const dy = f.y - ny;
        if (dx * dx + dy * dy <= reach * reach) {
          s.mass += f.size;
          if (s.mass > s.peakMass) s.peakMass = s.mass;
          this.removeFood(f);
        }
      });
    }

    this.resolveCollisions();

    let spawned = 0;
    while (this.food.size < this.foodTarget && spawned++ < 6) this.spawnFood();

    this.manageBots(now);
  }

  private resolveCollisions(): void {
    this.bodyGrid.clear();
    for (const s of this.snakes.values()) {
      if (s.protected) continue;
      const pts = s.points;
      for (let i = 0; i < pts.length; i++) this.bodyGrid.add(pts[i].x, pts[i].y, s.id, i);
    }

    const dead: Array<[Snake, Snake | null, 'snake' | 'wall']> = [];
    for (const s of this.snakes.values()) {
      const h = s.points[0];
      const r = snakeRadius(s.mass);
      if (h.x < r || h.y < r || h.x > this.width - r || h.y > this.height - r) {
        dead.push([s, null, 'wall']);
        continue;
      }
      if (s.protected) continue;

      let hit: Snake | null = null;
      let headOn = false;
      this.bodyGrid.forEachNear(h.x, h.y, r + 32, (oid, idx) => {
        if (hit || oid === s.id) return;
        const o = this.snakes.get(oid);
        if (!o) return;
        const p = o.points[idx];
        const reach = snakeRadius(o.mass) + r * 0.5;
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        if (dx * dx + dy * dy < reach * reach) {
          hit = o;
          headOn = idx <= 1;
        }
      });

      if (!hit) continue;
      const other: Snake = hit;
      if (!headOn || s.mass <= other.mass) dead.push([s, other, 'snake']);
    }

    for (const [s, killer, reason] of dead) {
      this.kill(s, killer, reason);
    }
  }

  private dangerAt(x: number, y: number, radius: number, selfId: number): boolean {
    if (x < 60 || y < 60 || x > this.width - 60 || y > this.height - 60) return true;
    let danger = false;
    this.bodyGrid.forEachNear(x, y, radius, (oid) => {
      if (oid !== selfId) danger = true;
    });
    return danger;
  }

  private think(s: Snake): void {
    const h = s.points[0];
    const r = snakeRadius(s.mass);
    const look = 70 + r * 2;

    const aheadX = h.x + Math.cos(s.angle) * look;
    const aheadY = h.y + Math.sin(s.angle) * look;
    if (this.dangerAt(aheadX, aheadY, r + 30, s.id)) {
      for (const delta of [0.9, -0.9, 1.8, -1.8, 2.7, -2.7]) {
        const a = s.angle + delta;
        if (!this.dangerAt(h.x + Math.cos(a) * look, h.y + Math.sin(a) * look, r + 30, s.id)) {
          s.targetAngle = normAngle(a);
          s.wantsBoost = false;
          return;
        }
      }
      s.targetAngle = Math.atan2(this.height / 2 - h.y, this.width / 2 - h.x);
      return;
    }

    let best: Food | null = null;
    let bestScore = Infinity;
    this.foodGrid.forEachNear(h.x, h.y, 320, (f) => {
      const dx = f.x - h.x;
      const dy = f.y - h.y;
      const score = (dx * dx + dy * dy) / (f.size * f.size);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    });

    if (best) {
      const f: Food = best;
      s.targetAngle = Math.atan2(f.y - h.y, f.x - h.x);
      s.wantsBoost = f.size >= 3 && s.mass > 40 && Math.random() < 0.3;
    } else {
      s.targetAngle = normAngle(s.targetAngle + (Math.random() - 0.5) * 0.8);
      s.wantsBoost = false;
    }
  }

  private manageBots(now: number): void {
    if (!config.env.BOT_ENABLE) return;
    const humans = this.humanCount();
    const g = gameConfig();
    const target = Math.max(0, Math.min(g.botsPerRoom, g.playersPerRoom - humans));
    const bots = this.snakes.size - humans;

    if (bots < target && now >= this.botRespawnAt) {
      const used = new Set(Array.from(this.snakes.values(), (s) => s.nickname));
      const free = BOT_NAMES.filter((n) => !used.has(n));
      const pool = free.length ? free : BOT_NAMES;
      const name = pool[Math.floor(Math.random() * pool.length)];
      this.spawnSnake('bot', name, true, g.startMass + Math.random() * 50, randomSkin());
      this.botRespawnAt = now + 1200;
    } else if (bots > target) {
      let smallest: Snake | null = null;
      for (const s of this.snakes.values()) {
        if (s.isBot && (!smallest || s.mass < smallest.mass)) smallest = s;
      }
      if (smallest) this.snakes.delete(smallest.id);
    }
  }
}

export class GameEngine {
  private readonly rooms = new Map<string, Room>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = performance.now();
  private tickMsAvg = 0;
  onTick: ((rooms: Room[]) => void) | null = null;

  start(): void {
    if (this.timer) return;
    const hz = config.resourceConfig.tickHz;
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), 1000 / hz);
    logger.info({ tickHz: hz }, 'Game engine started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const start = performance.now();
    const dt = Math.min(0.1, (start - this.last) / 1000);
    this.last = start;
    const now = Date.now();

    for (const [id, room] of this.rooms) {
      room.tick(dt, now);
      if (room.humanCount() === 0 && now - room.lastHumanAt > 60_000) this.rooms.delete(id);
    }

    try {
      this.onTick?.(Array.from(this.rooms.values()));
    } catch (err) {
      logger.error({ err }, 'onTick handler failed');
    }

    const took = performance.now() - start;
    this.tickMsAvg = this.tickMsAvg * 0.95 + took * 0.05;
  }

  findRoom(): Room | null {
    let best: Room | null = null;
    for (const room of this.rooms.values()) {
      const humans = room.humanCount();
      if (humans < gameConfig().playersPerRoom && (!best || humans > best.humanCount())) best = room;
    }
    if (best) return best;
    if (this.rooms.size >= config.resourceConfig.maxRooms) return null;
    const room = new Room();
    this.rooms.set(room.id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getTotalMetrics() {
    let humanPlayers = 0;
    let bots = 0;
    for (const room of this.rooms.values()) {
      const h = room.humanCount();
      humanPlayers += h;
      bots += room.snakes.size - h;
    }
    return {
      humanPlayers,
      bots,
      totalRooms: this.rooms.size,
      avgTickMs: Math.round(this.tickMsAvg * 100) / 100,
    };
  }
}

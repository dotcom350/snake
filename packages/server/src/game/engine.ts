import { randomUUID as uuidv4 } from 'crypto';
import type { Snake, Food, SnakeSegment } from '@snake/shared';
import { SpatialGrid } from './spatial-grid.js';
import { createChildLogger } from '../logger.js';
import { config } from '../config.js';

const logger = createChildLogger('game');

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#52E5A6',
];

export class GameEngine {
  private rooms: Map<string, Room> = new Map();
  private tickRate: number;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = Date.now();

  constructor() {
    this.tickRate = config.resourceConfig.tickHz;
  }

  start(): void {
    if (this.tickInterval) return;

    const tickDuration = 1000 / this.tickRate;
    this.tickInterval = setInterval(() => {
      this.tick();
    }, tickDuration);

    logger.info({ tickRate: this.tickRate }, 'Game engine started');
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      logger.info('Game engine stopped');
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    for (const room of this.rooms.values()) {
      room.tick(dt);
    }

    // Cleanup empty rooms
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.isEmpty() && now - room.createdAt > 60000) {
        this.rooms.delete(roomId);
      }
    }
  }

  findOrCreateRoom(): Room {
    // Find a room with space
    for (const room of this.rooms.values()) {
      if (
        room.getHumanCount() < config.resourceConfig.roomCapacity &&
        room.isActive()
      ) {
        return room;
      }
    }

    // Create new room if under limit
    if (this.rooms.size < config.resourceConfig.maxRooms) {
      const room = new Room();
      this.rooms.set(room.id, room);
      return room;
    }

    // Return first available room
    return this.rooms.values().next().value || new Room();
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getTotalMetrics() {
    let humanPlayers = 0;
    let bots = 0;
    let totalRooms = 0;

    for (const room of this.rooms.values()) {
      humanPlayers += room.getHumanCount();
      bots += room.bots.size;
      totalRooms++;
    }

    return { humanPlayers, bots, totalRooms };
  }
}

export class Room {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  tickCount: number = 0;
  snakes: Map<string, Snake> = new Map();
  bots: Set<string> = new Set();
  food: Map<string, Food> = new Map();
  private spatialGrid: SpatialGrid<{ x: number; y: number; id: string }>;
  private foodSpawnCounter: number = 0;

  constructor() {
    this.id = uuidv4();
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.spatialGrid = new SpatialGrid(200);

    this.initializeFood();
    this.spawnBots();
  }

  private initializeFood(): void {
    for (let i = 0; i < Math.floor(config.resourceConfig.maxFoodPerRoom / 2); i++) {
      this.spawnFood();
    }
  }

  private spawnFood(): void {
    if (this.food.size >= config.resourceConfig.maxFoodPerRoom) return;

    const food: Food = {
      id: uuidv4(),
      x: Math.random() * config.resourceConfig.arenaWidth,
      y: Math.random() * config.resourceConfig.arenaHeight,
      mass: 1 + Math.random() * 2,
    };

    this.food.set(food.id, food);
    this.spatialGrid.insert({ ...food, id: food.id });
  }

  private spawnBots(): void {
    if (!config.env.BOT_ENABLE) return;

    const targetBots = Math.min(
      config.resourceConfig.botMinPerRoom,
      config.resourceConfig.roomCapacity - this.getHumanCount()
    );

    while (this.bots.size < targetBots) {
      const bot = this.createSnake('bot', true);
      this.bots.add(bot.id);
    }
  }

  private createSnake(
    sessionId: string,
    isBot: boolean = false
  ): Snake {
    const x = Math.random() * config.resourceConfig.arenaWidth;
    const y = Math.random() * config.resourceConfig.arenaHeight;

    const segments: SnakeSegment[] = [
      { x, y },
      { x: x - 10, y },
      { x: x - 20, y },
    ];

    const snake: Snake = {
      id: uuidv4(),
      sessionId,
      nickname: isBot ? `Bot ${Math.random().toString(36).slice(2, 5)}` : 'Player',
      segments,
      direction: 1,
      nextDirection: 1,
      mass: 3,
      boost: 0,
      boosting: false,
      protected: false,
      protectedUntil: 0,
      isDead: false,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      runId: uuidv4(),
      peakScore: 0,
    };

    this.snakes.set(snake.id, snake);
    return snake;
  }

  addPlayer(sessionId: string, nickname: string): Snake {
    const snake = this.createSnake(sessionId);
    snake.nickname = nickname;
    this.lastActivityAt = Date.now();
    return snake;
  }

  removePlayer(snakeId: string): void {
    this.snakes.delete(snakeId);
    this.lastActivityAt = Date.now();
  }

  updateInput(snakeId: string, direction: number, boost: boolean): void {
    const snake = this.snakes.get(snakeId);
    if (!snake) return;

    snake.nextDirection = direction;
    if (boost && snake.mass >= config.resourceConfig.maxSnakeLength * 0.1) {
      snake.boosting = true;
    }
  }

  tick(dt: number): void {
    this.tickCount++;

    // Update snake directions and movement
    for (const snake of this.snakes.values()) {
      if (snake.isDead) continue;

      // Update direction
      if (
        snake.nextDirection !== snake.direction &&
        Math.abs(snake.nextDirection - snake.direction) !== 2
      ) {
        snake.direction = snake.nextDirection;
      }

      // Move snake
      const head = snake.segments[0];
      const speed = 200; // pixels per second
      const distance = speed * dt;

      let newX = head.x;
      let newY = head.y;

      switch (snake.direction) {
        case 0: // up
          newY -= distance;
          break;
        case 1: // right
          newX += distance;
          break;
        case 2: // down
          newY += distance;
          break;
        case 3: // left
          newX -= distance;
          break;
      }

      // Wrap around arena
      newX = ((newX % config.resourceConfig.arenaWidth) + config.resourceConfig.arenaWidth) % config.resourceConfig.arenaWidth;
      newY = ((newY % config.resourceConfig.arenaHeight) + config.resourceConfig.arenaHeight) % config.resourceConfig.arenaHeight;

      // Handle boost
      if (snake.boosting) {
        snake.mass -= 0.5;
        if (snake.mass < 2) {
          snake.boosting = false;
        }
      }

      // Add new segment
      snake.segments.unshift({ x: newX, y: newY });

      // Check food collection
      const nearby = this.spatialGrid.getNearby(newX, newY, 15);
      for (const item of nearby) {
        const food = this.food.get(item.id);
        if (food) {
          snake.mass += food.mass;
          snake.peakScore = Math.max(snake.peakScore, Math.floor(snake.mass * 10));
          this.food.delete(food.id);
          this.spatialGrid.remove(item);
          break;
        }
      }

      // Remove tail segment to maintain length
      if (snake.segments.length > config.resourceConfig.maxSnakeLength) {
        snake.segments.pop();
      }

      // Check collisions with other snakes
      for (const otherSnake of this.snakes.values()) {
        if (otherSnake === snake || otherSnake.isDead) continue;

        for (let i = 0; i < otherSnake.segments.length; i++) {
          const segment = otherSnake.segments[i];
          const dx = newX - segment.x;
          const dy = newY - segment.y;
          if (dx * dx + dy * dy < 100) {
            if (i === 0) {
              // Head-to-head collision
              if (snake.mass > otherSnake.mass) {
                otherSnake.isDead = true;
              } else if (otherSnake.mass > snake.mass) {
                snake.isDead = true;
              } else {
                snake.isDead = true;
                otherSnake.isDead = true;
              }
            } else {
              // Head-to-body collision
              snake.isDead = true;
            }
            break;
          }
        }
      }

      // Check self-collision
      for (let i = 1; i < Math.min(snake.segments.length, 4); i++) {
        const segment = snake.segments[i];
        const dx = newX - segment.x;
        const dy = newY - segment.y;
        if (dx * dx + dy * dy < 50) {
          snake.isDead = true;
          break;
        }
      }

      // Check protection expiry
      if (
        snake.protected &&
        Date.now() > snake.protectedUntil
      ) {
        snake.protected = false;
      }
    }

    // Spawn food if needed
    this.foodSpawnCounter++;
    if (
      this.foodSpawnCounter > 30 &&
      this.food.size < Math.floor(config.resourceConfig.maxFoodPerRoom * 0.7)
    ) {
      this.spawnFood();
      this.foodSpawnCounter = 0;
    }

    // Bot AI (simplified)
    for (const botId of this.bots) {
      const bot = this.snakes.get(botId);
      if (bot && !bot.isDead) {
        const nearbyFood = this.spatialGrid.getNearby(
          bot.segments[0].x,
          bot.segments[0].y,
          300
        );
        if (nearbyFood.length > 0) {
          const target = nearbyFood[0];
          const dx = target.x - bot.segments[0].x;
          const dy = target.y - bot.segments[0].y;
          if (Math.abs(dx) > Math.abs(dy)) {
            bot.nextDirection = dx > 0 ? 1 : 3;
          } else {
            bot.nextDirection = dy > 0 ? 2 : 0;
          }
        }
      }
    }
  }

  getHumanCount(): number {
    return this.snakes.size - this.bots.size;
  }

  isEmpty(): boolean {
    return this.getHumanCount() === 0 && this.bots.size === 0;
  }

  isActive(): boolean {
    return Date.now() - this.lastActivityAt < 30000; // 30 seconds
  }

  getGameState() {
    const leaderboard = Array.from(this.snakes.values())
      .filter(s => !s.isDead)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map((s, i) => ({
        rank: i + 1,
        nickname: s.nickname,
        score: Math.floor(s.mass * 10),
        isBot: this.bots.has(s.id),
      }));

    return {
      tick: this.tickCount,
      time: Date.now(),
      snakes: Array.from(this.snakes.values())
        .filter(s => !s.isDead)
        .map(s => ({
          id: s.id,
          nickname: s.nickname,
          color: s.color,
          segments: s.segments.map(seg => [seg.x, seg.y] as [number, number]),
          mass: s.mass,
          boosting: s.boosting,
          protected: s.protected,
        })),
      food: Array.from(this.food.values()).map(f => ({
        id: f.id,
        x: f.x,
        y: f.y,
      })),
      leaderboard,
    };
  }
}

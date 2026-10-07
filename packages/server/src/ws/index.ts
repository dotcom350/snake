import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import {
  JoinMessageSchema,
  encodeState,
  isValidNickname,
  normalizeNickname,
  type EncodableFood,
  type EncodableSnake,
  type ErrorCode,
  type MetaPlayer,
  type ServerMessage,
} from '@snake/shared';
import type { GameEngine, Room, Snake } from '../game/engine.js';
import { createChildLogger } from '../logger.js';
import { config } from '../config.js';
import { enabledSkinIds } from '../settings.js';
import { stats } from '../stats.js';

const logger = createChildLogger('ws');

const MAX_BUFFERED_BYTES = 256 * 1024;
const MIN_INPUT_INTERVAL_MS = 30;
const META_INTERVAL_MS = 1000;
const HEARTBEAT_MS = 30_000;

interface Client {
  socket: WebSocket;
  room: Room | null;
  snakeId: number;
  sessionId: string;
  nickname: string;
  lastInputAt: number;
  lastMetaAt: number;
  viewX: number;
  viewY: number;
  alive: boolean;
}

export class GameSocketServer {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 512,
    perMessageDeflate: false,
    clientTracking: false,
  });
  private readonly clients = new Set<Client>();
  private readonly bySnake = new Map<string, Client>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly viewRadius = config.resourceConfig.profile === 'low' ? 1000 : 1300;

  constructor(private readonly engine: GameEngine) {
    engine.onTick = (rooms) => this.broadcast(rooms);
  }

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== config.env.WS_PATH) {
        socket.destroy();
        return;
      }
      if (this.clients.size >= config.resourceConfig.connectionLimit) {
        socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });

    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.socket.terminate();
          continue;
        }
        c.alive = false;
        c.socket.ping();
      }
    }, HEARTBEAT_MS);
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.clients) c.socket.close(1001, 'Server shutting down');
    this.wss.close();
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  private onConnection(socket: WebSocket): void {
    const client: Client = {
      socket,
      room: null,
      snakeId: 0,
      sessionId: '',
      nickname: '',
      lastInputAt: 0,
      lastMetaAt: 0,
      viewX: 0,
      viewY: 0,
      alive: true,
    };
    this.clients.add(client);
    stats.inc('connections');

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      try {
        this.onMessage(client, data.toString());
      } catch (err) {
        logger.debug({ err }, 'Bad message');
      }
    });
    socket.on('close', () => this.onClose(client));
    socket.on('error', (err) => logger.debug({ err }, 'Socket error'));
  }

  private send(client: Client, msg: ServerMessage): void {
    if (client.socket.readyState === 1) client.socket.send(JSON.stringify(msg));
  }

  private sendError(client: Client, code: ErrorCode): void {
    this.send(client, { type: 'error', code });
  }

  private onMessage(client: Client, raw: string): void {
    const msg = JSON.parse(raw) as { type?: unknown; a?: unknown; b?: unknown };

    if (msg.type === 'input') {
      if (!client.room || !client.snakeId) return;
      const now = Date.now();
      if (now - client.lastInputAt < MIN_INPUT_INTERVAL_MS) return;
      if (typeof msg.a !== 'number' || !Number.isFinite(msg.a) || Math.abs(msg.a) > 10) return;
      if (typeof msg.b !== 'boolean') return;
      client.lastInputAt = now;
      client.room.setInput(client.snakeId, msg.a, msg.b);
      return;
    }

    if (msg.type === 'join') this.onJoin(client, msg);
  }

  private onJoin(client: Client, raw: unknown): void {
    const parsed = JoinMessageSchema.safeParse(raw);
    if (!parsed.success) return this.sendError(client, 'INVALID_INPUT');

    if (client.room && client.snakeId && client.room.snakes.has(client.snakeId)) return;

    const nickname = normalizeNickname(parsed.data.nickname);
    if (!isValidNickname(nickname)) return this.sendError(client, 'NICKNAME_INVALID');

    let room = client.room && this.engine.getRoom(client.room.id) ? client.room : null;
    room ??= this.engine.findRoom();
    if (!room) return this.sendError(client, 'SERVER_FULL');

    const { skin: wanted, d: device, l: lang } = parsed.data;
    const skin = enabledSkinIds().includes(wanted) ? wanted : enabledSkinIds()[0];
    const snake = room.addPlayer(parsed.data.sessionId, nickname, skin, device, lang);
    stats.inc('game_start', device);
    stats.inc('game_lang', lang);
    stats.inc('skin', String(skin));
    stats.unique('player', parsed.data.sessionId);
    client.room = room;
    client.snakeId = snake.id;
    client.sessionId = parsed.data.sessionId;
    client.nickname = nickname;
    client.lastMetaAt = 0;
    this.bySnake.set(`${room.id}:${snake.id}`, client);

    this.send(client, {
      type: 'joined',
      id: snake.id,
      arena: { w: room.width, h: room.height },
      tickHz: config.resourceConfig.tickHz,
    });
    logger.info({ roomId: room.id, humans: room.humanCount() }, 'Player joined');
  }

  private onClose(client: Client): void {
    if (client.room && client.snakeId) {
      const snake = client.room.removeSnake(client.snakeId);
      this.bySnake.delete(`${client.room.id}:${client.snakeId}`);
      if (snake) this.recordGame(snake, 'quit');
    }
    this.clients.delete(client);
  }

  private recordGame(s: Snake, reason: 'snake' | 'wall' | 'quit'): void {
    stats.game({
      startedAt: s.bornAt,
      endedAt: Date.now(),
      nickname: s.nickname,
      score: Math.floor(s.peakMass),
      kills: s.kills,
      reason,
      device: s.device,
      lang: s.lang,
      skin: s.skin,
    });
  }

  private broadcast(rooms: Room[]): void {
    for (const room of rooms) {
      for (const d of room.takeDeaths()) {
        if (d.killer) {
          stats.inc('kill', d.killer.isBot ? 'bot' : 'player');
          if (!d.killer.isBot) {
            const killerClient = this.bySnake.get(`${room.id}:${d.killer.id}`);
            if (killerClient) this.send(killerClient, { type: 'kill', name: d.snake.nickname });
          }
        }
        if (d.snake.isBot) continue;
        this.recordGame(d.snake, d.reason);
        const key = `${room.id}:${d.snake.id}`;
        const client = this.bySnake.get(key);
        this.bySnake.delete(key);
        if (!client) continue;
        client.snakeId = 0;
        this.send(client, { type: 'died', score: d.score, killer: d.killer?.nickname ?? null, reason: d.reason });
      }
    }

    const now = Date.now();
    const roomCache = new Map<Room, { list: Snake[]; boxes: Float64Array; players: MetaPlayer[]; ranked: Snake[] }>();

    for (const client of this.clients) {
      const room = client.room;
      if (!room || client.socket.readyState !== 1) continue;
      if (client.socket.bufferedAmount > MAX_BUFFERED_BYTES) continue;

      let cache = roomCache.get(room);
      if (!cache) {
        const list = Array.from(room.snakes.values());
        const boxes = new Float64Array(list.length * 4);
        list.forEach((s, i) => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of s.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
          boxes.set([minX, minY, maxX, maxY], i * 4);
        });
        cache = { list, boxes, players: list.map((s) => [s.id, s.nickname] as MetaPlayer), ranked: [] };
        roomCache.set(room, cache);
      }

      const self = client.snakeId ? room.snakes.get(client.snakeId) : undefined;
      if (self) {
        client.viewX = self.points[0].x;
        client.viewY = self.points[0].y;
      }
      const reach = this.viewRadius + (self ? self.mass * 0.5 : 0);
      const minX = client.viewX - reach, maxX = client.viewX + reach;
      const minY = client.viewY - reach, maxY = client.viewY + reach;

      const visible: EncodableSnake[] = [];
      for (let i = 0; i < cache.list.length; i++) {
        const b = i * 4;
        if (cache.boxes[b + 2] < minX || cache.boxes[b] > maxX || cache.boxes[b + 3] < minY || cache.boxes[b + 1] > maxY) continue;
        visible.push(cache.list[i]);
      }
      const food: EncodableFood[] = [];
      room.forEachFoodInRect(minX, minY, maxX, maxY, (f) => {
        food.push(f);
      });

      try {
        client.socket.send(encodeState(room.tickCount, self ? self.id : 0, visible, food));
      } catch (err) {
        logger.debug({ err }, 'Send failed');
      }

      if (now - client.lastMetaAt >= META_INTERVAL_MS) {
        client.lastMetaAt = now;
        if (cache.ranked.length === 0) cache.ranked = room.leaderboard();
        const rank = self ? cache.ranked.indexOf(self) + 1 : 0;
        this.send(client, {
          type: 'meta',
          players: cache.players,
          top: cache.ranked.slice(0, 10).map((s) => [s.nickname, Math.floor(s.mass), s === self]),
          rank,
          count: cache.ranked.length,
        });
      }
    }
  }
}

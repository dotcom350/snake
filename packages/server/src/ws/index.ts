import type { FastifyInstance } from 'fastify';
import WebSocket, { WebSocketServer as WSServer } from 'ws';
import http from 'http';
import type { GameState as GameStateType } from '@snake/shared';
import { InputIntentSchema, JoinRoomSchema, BinaryCodec } from '@snake/shared';
import { GameEngine } from '../game/engine.js';
import { createChildLogger } from '../logger.js';
import { config } from '../config.js';

const logger = createChildLogger('ws');

interface ClientConnection {
  socket: WebSocket;
  sessionId: string;
  snakeId?: string;
  roomId?: string;
  nickname?: string;
  lastInputTime: number;
}

export class WebSocketServer {
  private engine: GameEngine;
  private clients: Map<string, ClientConnection> = new Map();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private wsServer: WSServer | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  register(fastify: FastifyInstance): void {
    // WebSocket will be attached to the HTTP server
    // after Fastify listens
    fastify.addHook('onListen', () => {
      const server = fastify.server as http.Server;
      this.wsServer = new WSServer({ server, path: config.env.WS_PATH });

      this.wsServer.on('connection', (socket) => {
        this.handleConnection(socket);
      });
    });
  }

  start(): void {
    if (this.broadcastInterval) return;

    const broadcastInterval = Math.ceil(1000 / (config.resourceConfig.tickHz * 2));
    this.broadcastInterval = setInterval(() => {
      this.broadcastGameState();
    }, broadcastInterval);

    logger.info({ interval: broadcastInterval }, 'WebSocket broadcast started');
  }

  stop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    if (this.wsServer) {
      this.wsServer.close();
    }
  }

  private handleConnection(socket: WebSocket): void {
    const clientId = Math.random().toString(36).substring(2, 15);
    const sessionId = Math.random().toString(36).substring(2, 15);
    const connection: ClientConnection = {
      socket,
      sessionId,
      lastInputTime: Date.now(),
    };

    this.clients.set(clientId, connection);

    logger.info({ clientId, sessionId }, 'Client connected');

    socket.on('message', (data: any) => {
      try {
        this.handleMessage(clientId, connection, data);
      } catch (err) {
        logger.error({ err, clientId }, 'Error handling message');
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(clientId, connection);
    });

    socket.on('error', (err: Error) => {
      logger.error({ err, clientId }, 'WebSocket error');
    });
  }

  private handleMessage(clientId: string, connection: ClientConnection, data: any): void {
    if (data instanceof ArrayBuffer) {
      // Binary codec for input - future optimization
      return;
    }

    const message = JSON.parse(data.toString());

    if (message.type === 'join') {
      this.handleJoin(clientId, connection, message);
    } else if (message.type === 'input') {
      this.handleInput(clientId, connection, message);
    }
  }

  private handleJoin(
    clientId: string,
    connection: ClientConnection,
    message: any
  ): void {
    try {
      const parsed = JoinRoomSchema.parse(message.payload);
      const room = this.engine.findOrCreateRoom();

      const snake = room.addPlayer(connection.sessionId, parsed.nickname);
      connection.snakeId = snake.id;
      connection.roomId = room.id;
      connection.nickname = parsed.nickname;

      connection.socket.send(
        JSON.stringify({
          type: 'joined',
          snakeId: snake.id,
          roomId: room.id,
          sessionId: connection.sessionId,
        })
      );

      logger.info(
        { clientId, nickname: parsed.nickname, roomId: room.id },
        'Player joined'
      );
    } catch (err) {
      connection.socket.send(
        JSON.stringify({
          type: 'error',
          code: 'INVALID_INPUT',
          message: 'Invalid join payload',
        })
      );
    }
  }

  private handleInput(
    clientId: string,
    connection: ClientConnection,
    message: any
  ): void {
    if (!connection.snakeId || !connection.roomId) return;

    // Rate limit: max 20 inputs per second per client
    const now = Date.now();
    if (now - connection.lastInputTime < 50) return;
    connection.lastInputTime = now;

    try {
      const input = InputIntentSchema.parse(message.payload);
      const room = this.engine.getRoom(connection.roomId);
      if (room) {
        room.updateInput(connection.snakeId, input.direction, input.boost);
      }
    } catch (err) {
      logger.debug({ clientId, err }, 'Invalid input');
    }
  }

  private handleDisconnect(clientId: string, connection: ClientConnection): void {
    if (connection.snakeId && connection.roomId) {
      const room = this.engine.getRoom(connection.roomId);
      if (room) {
        room.removePlayer(connection.snakeId);
        logger.info(
          { clientId, nickname: connection.nickname, roomId: connection.roomId },
          'Player left'
        );
      }
    }

    this.clients.delete(clientId);
  }

  private broadcastGameState(): void {
    const roomStates = new Map<string, GameStateType>();

    for (const room of this.engine.getRooms()) {
      roomStates.set(room.id, room.getGameState());
    }

    for (const [clientId, connection] of this.clients) {
      if (!connection.roomId || connection.socket.readyState !== 1) continue;

      const state = roomStates.get(connection.roomId);
      if (!state) continue;

      try {
        // Send binary-encoded state
        const encoded = BinaryCodec.encodeGameState(
          state.tick,
          state.snakes,
          state.food
        );

        connection.socket.send(encoded);
      } catch (err) {
        logger.error({ clientId, err }, 'Error sending state');
      }
    }
  }
}

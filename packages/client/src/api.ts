import type { GameState, InputIntent } from '@snake/shared';
import { BinaryCodec } from '@snake/shared';
import { createChildLogger } from '../shared/src/logger';

type Logger = ReturnType<typeof createChildLogger>;

export interface GameStateListener {
  onStateUpdate(state: GameState): void;
  onError(error: string): void;
  onConnected(): void;
  onDisconnected(): void;
}

export class GameClient {
  private ws: WebSocket | null = null;
  private listeners: Set<GameStateListener> = new Set();
  private sessionId: string | null = null;
  private snakeId: string | null = null;
  private roomId: string | null = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  async connect(nickname: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;

          this.ws!.send(
            JSON.stringify({
              type: 'join',
              payload: {
                nickname,
                sessionId: this.sessionId || this.generateSessionId(),
              },
            })
          );

          this.notifyListeners('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.notifyListeners('error', 'Connection error');
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.notifyListeners('disconnected');
          this.attemptReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  sendInput(direction: number, boost: boolean): void {
    if (!this.connected || !this.ws) return;

    const intent: InputIntent = {
      direction,
      boost,
      timestamp: Date.now(),
    };

    this.ws.send(
      JSON.stringify({
        type: 'input',
        payload: intent,
      })
    );
  }

  private handleMessage(data: any): void {
    if (data instanceof ArrayBuffer) {
      // Binary codec for game state
      try {
        const decoded = BinaryCodec.decodeGameState(data);
        const gameState: GameState = {
          tick: decoded.tick,
          time: Date.now(),
          snakes: [], // Will be rebuilt from decoded data
          food: decoded.food.map(f => ({ id: String(f.idHash), x: f.x, y: f.y })),
          leaderboard: [],
        };

        for (const snake of decoded.snakes) {
          gameState.snakes.push({
            id: String(snake.idHash),
            nickname: `Player`,
            color: '#4ECDC4',
            segments: snake.segments,
            mass: snake.mass,
            boosting: snake.boosting,
            protected: snake.protected,
          });
        }

        this.notifyListeners('stateUpdate', gameState);
      } catch (err) {
        console.error('Failed to decode game state:', err);
      }
    } else {
      // JSON messages
      const message = JSON.parse(data.toString());

      if (message.type === 'joined') {
        this.sessionId = message.sessionId;
        this.snakeId = message.snakeId;
        this.roomId = message.roomId;
      } else if (message.type === 'error') {
        this.notifyListeners('error', message.message);
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyListeners('error', 'Failed to reconnect');
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.connected) {
        // Will attempt to reconnect
      }
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  private generateSessionId(): string {
    const stored = localStorage.getItem('sessionId');
    if (stored) return stored;

    const id = self.crypto.randomUUID();
    localStorage.setItem('sessionId', id);
    return id;
  }

  subscribe(listener: GameStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(
    event: 'stateUpdate' | 'connected' | 'disconnected' | 'error',
    data?: any
  ): void {
    for (const listener of this.listeners) {
      if (event === 'stateUpdate' && data) {
        listener.onStateUpdate(data);
      } else if (event === 'connected') {
        listener.onConnected();
      } else if (event === 'disconnected') {
        listener.onDisconnected();
      } else if (event === 'error' && data) {
        listener.onError(data);
      }
    }
  }
}

export const gameClient = new GameClient();

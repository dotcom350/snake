import { decodeState, type DecodedState, type ServerMessage, type ClientMessage } from '@snake/shared/protocol';

export interface NetHandlers {
  onState(state: DecodedState, receivedAt: number): void;
  onMessage(msg: ServerMessage): void;
  onClose(): void;
}

const CONNECT_TIMEOUT_MS = 8000;
const INPUT_INTERVAL_MS = 50;

export class Net {
  private ws: WebSocket | null = null;
  private lastAngle = NaN;
  private lastBoost = false;
  private lastSentAt = 0;

  constructor(private readonly handlers: NetHandlers) {}

  connect(): Promise<void> {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    return new Promise((resolve, reject) => {
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) {
          ws.close();
          reject(new Error('timeout'));
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        opened = true;
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        if (!opened) {
          clearTimeout(timer);
          reject(new Error('connect failed'));
        }
      };
      ws.onclose = () => {
        if (opened && this.ws === ws) this.handlers.onClose();
      };
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          try {
            this.handlers.onState(decodeState(event.data), performance.now());
          } catch {
            // Ignore malformed frames.
          }
        } else {
          try {
            this.handlers.onMessage(JSON.parse(event.data as string) as ServerMessage);
          } catch {
            // Ignore malformed frames.
          }
        }
      };
    });
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  join(nickname: string, sessionId: string): void {
    this.lastAngle = NaN;
    this.send({ type: 'join', nickname, sessionId });
  }

  input(angle: number, boost: boolean, now: number): void {
    if (now - this.lastSentAt < INPUT_INTERVAL_MS) return;
    const changed = !(Math.abs(angle - this.lastAngle) < 0.02) || boost !== this.lastBoost;
    if (!changed) return;
    this.lastAngle = angle;
    this.lastBoost = boost;
    this.lastSentAt = now;
    this.send({ type: 'input', a: Math.round(angle * 1000) / 1000, b: boost });
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

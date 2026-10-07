import WebSocket from 'ws';
import os from 'os';
import { randomBytes } from 'crypto';

const [url = 'ws://localhost:3000/ws', countArg = '10', durationArg = '30'] = process.argv.slice(2);
const clientCount = Number(countArg) || 10;
const durationSec = Number(durationArg) || 30;

console.log(`Load test: ${clientCount} clients for ${durationSec}s against ${url}`);
console.log(`Machine: ${os.availableParallelism()} CPU, ${Math.round(os.totalmem() / 1048576)} MB RAM\n`);

let connected = 0;
let failed = 0;
let stateMessages = 0;
let stateBytes = 0;
let deaths = 0;
const gaps: number[] = [];
const sockets: WebSocket[] = [];

function startClient(index: number): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    let lastState = 0;
    let angle = Math.random() * Math.PI * 2;
    let timer: ReturnType<typeof setInterval> | null = null;
    const join = () =>
      ws.send(JSON.stringify({ type: 'join', nickname: `Load${index}`, sessionId: randomBytes(16).toString('hex') }));

    ws.on('open', () => {
      connected++;
      join();
      timer = setInterval(() => {
        angle += (Math.random() - 0.5) * 0.8;
        ws.send(JSON.stringify({ type: 'input', a: angle, b: Math.random() < 0.1 }));
      }, 100);
      resolve();
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const now = Date.now();
        if (lastState) gaps.push(now - lastState);
        lastState = now;
        stateMessages++;
        stateBytes += (data as ArrayBuffer).byteLength;
        return;
      }
      const msg = JSON.parse(data.toString());
      if (msg.type === 'died') {
        deaths++;
        setTimeout(join, 500);
      }
    });
    ws.on('error', () => {
      failed++;
      resolve();
    });
    ws.on('close', () => {
      if (timer) clearInterval(timer);
    });
    sockets.push(ws);
  });
}

async function main() {
  for (let i = 0; i < clientCount; i++) {
    await startClient(i);
    await new Promise((r) => setTimeout(r, 20));
  }
  console.log(`Connected: ${connected}, failed: ${failed}`);

  await new Promise((r) => setTimeout(r, durationSec * 1000));
  for (const ws of sockets) ws.close();

  gaps.sort((a, b) => a - b);
  const pct = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] ?? 0;
  console.log(`State messages: ${stateMessages}`);
  console.log(`Avg state size: ${stateMessages ? Math.round(stateBytes / stateMessages) : 0} bytes`);
  console.log(`Per-client bandwidth: ${Math.round(stateBytes / Math.max(1, connected) / durationSec / 1024)} KB/s`);
  console.log(`State interval p50/p95/p99: ${pct(0.5)} / ${pct(0.95)} / ${pct(0.99)} ms`);
  console.log(`Deaths (respawned): ${deaths}`);
  process.exit(0);
}

void main();

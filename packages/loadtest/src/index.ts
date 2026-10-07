import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import os from 'os';

interface Stats {
  tickLatencies: number[];
  messageCount: number;
  errorCount: number;
  startTime: number;
  endTime: number;
}

const stats: Stats = {
  tickLatencies: [],
  messageCount: 0,
  errorCount: 0,
  startTime: Date.now(),
  endTime: 0,
};

const args = process.argv.slice(2);
const serverUrl = args[0] || 'ws://localhost:3000/ws';
const clientCount = parseInt(args[1]) || 10;
const duration = parseInt(args[2]) || 30; // seconds

console.log('🎮 Snake Game Load Test');
console.log(`📊 Server: ${serverUrl}`);
console.log(`👥 Clients: ${clientCount}`);
console.log(`⏱️  Duration: ${duration}s`);
console.log(`💻 CPU: ${os.cpus().length}x ${os.cpus()[0].model}`);
console.log(`🧠 Memory: ${(os.totalmem() / 1024 / 1024).toFixed(0)} MB\n`);

let connectedClients = 0;
const clients: WebSocket[] = [];

function createClient(index: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(serverUrl);
      let lastMessageTime = Date.now();

      ws.on('open', () => {
        connectedClients++;
        console.log(`✅ Client ${index + 1} connected (total: ${connectedClients}/${clientCount})`);

        // Send join message
        ws.send(
          JSON.stringify({
            type: 'join',
            payload: {
              nickname: `LoadBot${index}`,
              sessionId: `session-${index}-${Math.random()}`,
            },
          })
        );

        // Send random inputs
        const inputInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const direction = Math.floor(Math.random() * 4);
            const boost = Math.random() > 0.8;

            ws.send(
              JSON.stringify({
                type: 'input',
                payload: {
                  direction,
                  boost,
                  timestamp: Date.now(),
                },
              })
            );
          }
        }, 50 + Math.random() * 50); // 50-100ms between inputs

        ws.on('message', (data) => {
          const now = Date.now();
          const latency = now - lastMessageTime;
          stats.tickLatencies.push(latency);
          stats.messageCount++;
          lastMessageTime = now;
        });

        // Cleanup on close
        ws.on('close', () => {
          clearInterval(inputInterval);
          connectedClients--;
        });

        ws.on('error', (error) => {
          stats.errorCount++;
          clearInterval(inputInterval);
          console.error(`❌ Client ${index} error:`, error.message);
        });

        resolve();
      });

      ws.on('error', (error) => {
        reject(error);
      });

      clients.push(ws);
    } catch (err) {
      reject(err);
    }
  });
}

async function runLoadTest(): Promise<void> {
  try {
    console.log('🚀 Connecting clients...\n');

    // Connect all clients with some delay between them
    for (let i = 0; i < clientCount; i++) {
      try {
        await createClient(i);
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms between connections
      } catch (err) {
        console.error(`❌ Failed to create client ${i}:`, err);
      }
    }

    console.log(`\n⏳ Running test for ${duration} seconds...\n`);

    // Wait for duration
    await new Promise((resolve) => setTimeout(resolve, duration * 1000));

    // Close all connections
    console.log('\n🛑 Closing connections...');
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }

    stats.endTime = Date.now();

    // Calculate stats
    const elapsed = (stats.endTime - stats.startTime) / 1000;
    const avgLatency =
      stats.tickLatencies.length > 0
        ? stats.tickLatencies.reduce((a, b) => a + b, 0) / stats.tickLatencies.length
        : 0;
    const maxLatency = stats.tickLatencies.length > 0 ? Math.max(...stats.tickLatencies) : 0;
    const p95Latency = stats.tickLatencies.length > 0
      ? stats.tickLatencies.sort((a, b) => a - b)[Math.floor(stats.tickLatencies.length * 0.95)]
      : 0;

    // Get process memory
    const memUsage = process.memoryUsage();
    const rssMemMB = memUsage.rss / 1024 / 1024;
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

    console.log('\n📈 Load Test Results');
    console.log('═'.repeat(50));
    console.log(`⏱️  Elapsed Time: ${elapsed.toFixed(1)}s`);
    console.log(`👥 Peak Connections: ${clientCount}`);
    console.log(`📊 Messages Received: ${stats.messageCount}`);
    console.log(`❌ Errors: ${stats.errorCount}`);
    console.log(`📉 Message Rate: ${(stats.messageCount / elapsed).toFixed(1)} msg/s`);

    console.log('\n⏳ Latency Stats (milliseconds)');
    console.log('─'.repeat(50));
    console.log(`Average: ${avgLatency.toFixed(2)}ms`);
    console.log(`P95: ${p95Latency.toFixed(2)}ms`);
    console.log(`Max: ${maxLatency.toFixed(2)}ms`);

    console.log('\n🧠 Memory Usage');
    console.log('─'.repeat(50));
    console.log(`RSS: ${rssMemMB.toFixed(1)} MB`);
    console.log(`Heap Used: ${heapUsedMB.toFixed(1)} MB`);

    console.log('\n✅ Load test completed!');
  } catch (err) {
    console.error('❌ Load test failed:', err);
    process.exit(1);
  }
}

runLoadTest();

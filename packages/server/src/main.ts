import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger, createChildLogger } from './logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { GameEngine } from './game/engine.js';
import { WebSocketServer } from './ws/index.js';
import { registerRoutes } from './api/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverLogger = createChildLogger('server');

async function main() {
  let gameEngine: GameEngine | null = null;
  let wsServer: WebSocketServer | null = null;

  try {
    logger.info({ profile: config.resourceConfig.profile }, 'Starting application');

    // Initialize database
    await initDatabase();

    // Create Fastify instance
    const fastify = Fastify({
      logger: {
        level: config.env.LOG_LEVEL,
      },
    });

    // Register plugins
    await fastify.register(fastifyHelmet, {
      crossOriginResourcePolicy: false,
    });

    await fastify.register(fastifyCors, {
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
      credentials: true,
    });

    // Serve static files (frontend)
    const publicDir = path.join(__dirname, '../../client/dist');
    await fastify.register(fastifyStatic, {
      root: publicDir,
      constraints: {},
    });

    // Initialize game engine
    gameEngine = new GameEngine();
    gameEngine.start();

    // Initialize WebSocket server
    wsServer = new WebSocketServer(gameEngine);
    wsServer.register(fastify);
    wsServer.start();

    // Register API routes
    await registerRoutes(fastify, gameEngine);

    // SPA fallback
    fastify.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'NOT_FOUND' });
    });

    // Start server
    await fastify.listen(
      {
        port: config.env.SERVER_PORT,
        host: config.env.SERVER_HOST,
      },
      (err, address) => {
        if (err) {
          serverLogger.error({ err }, 'Failed to start server');
          process.exit(1);
        }
        serverLogger.info(
          {
            address,
            nodeEnv: config.env.NODE_ENV,
            resourceProfile: config.resourceConfig.profile,
            tickHZ: config.resourceConfig.tickHz,
          },
          'Server listening'
        );
      }
    );

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'] as const;
    for (const signal of signals) {
      process.on(signal, async () => {
        serverLogger.info({ signal }, 'Received signal, shutting down');

        if (wsServer) wsServer.stop();
        if (gameEngine) gameEngine.stop();

        await fastify.close();
        await closeDatabase();

        serverLogger.info('Shutdown complete');
        process.exit(0);
      });
    }
  } catch (err) {
    logger.error({ err }, 'Fatal error');
    process.exit(1);
  }
}

main();

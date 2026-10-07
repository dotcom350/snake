import Fastify, { LogController, type FastifyBaseLogger } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { GameEngine } from './game/engine.js';
import { GameSocketServer } from './ws/index.js';
import { registerRoutes } from './api/routes.js';
import { registerPages } from './pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../../client/dist');

async function main() {
  logger.info({ ...config.resourceConfig }, 'Starting application');

  await initDatabase();

  const fastify = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    trustProxy: true,
    logController: new LogController({ disableRequestLogging: true }),
  });

  await fastify.register(fastifyHelmet, {
    crossOriginResourcePolicy: false,
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: null,
        connectSrc: ["'self'", 'ws:', 'wss:'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });

  await fastify.register(fastifyStatic, {
    root: publicDir,
    index: false,
    wildcard: true,
    preCompressed: true,
    cacheControl: false,
    allowedPath: (pathName) => !pathName.endsWith('.html'),
    setHeaders: (res, filePath) => {
      const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
      res.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
    },
  });

  const engine = new GameEngine();
  const sockets = new GameSocketServer(engine);
  sockets.attach(fastify.server);

  await registerRoutes(fastify, engine, sockets);
  await registerPages(fastify, publicDir);

  await fastify.listen({ port: config.env.SERVER_PORT, host: config.env.SERVER_HOST });
  engine.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    engine.stop();
    sockets.stop();
    await fastify.close();
    await closeDatabase();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error');
  process.exit(1);
});

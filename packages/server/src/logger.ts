import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.env.LOG_LEVEL,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
        },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}

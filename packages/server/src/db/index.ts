import { Pool } from 'pg';
import { config } from '../config';
import { createChildLogger } from '../logger';
import { runMigrations } from './migrations';

const logger = createChildLogger('db');

let pool: Pool | null = null;

export async function initDatabase(): Promise<Pool> {
  if (pool) return pool;

  pool = new Pool({
    connectionString: config.env.DATABASE_URL,
    max: config.resourceConfig.dbPoolSize,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle client');
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    logger.info(
      { timestamp: result.rows[0].now },
      'Database connected successfully'
    );

    await runMigrations(pool);

    return pool;
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    throw err;
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}

export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results[0] || null;
}

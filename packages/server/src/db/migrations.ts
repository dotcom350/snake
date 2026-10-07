import { Pool } from 'pg';
import { createChildLogger } from '../logger';

const logger = createChildLogger('migrations');

const MIGRATIONS: Array<{
  name: string;
  up: string;
  down: string;
}> = [
  {
    name: '001_initial_schema',
    up: `
CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  permissions TEXT[] DEFAULT '{"view_metrics", "edit_settings"}',
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  last_login_at BIGINT
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(16) NOT NULL,
  ip_hash VARCHAR(64) NOT NULL,
  locale VARCHAR(2) DEFAULT 'en',
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  expires_at BIGINT NOT NULL,
  last_activity_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  peak_score INTEGER NOT NULL DEFAULT 0,
  current_score INTEGER NOT NULL DEFAULT 0,
  death_count INTEGER NOT NULL DEFAULT 0,
  revival_used BOOLEAN DEFAULT FALSE,
  started_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  ended_at BIGINT
);

CREATE TABLE IF NOT EXISTS revive_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  death_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting',
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  expires_at BIGINT NOT NULL,
  verified_at BIGINT,
  restore_mass FLOAT NOT NULL,
  respawn_x INTEGER NOT NULL,
  respawn_y INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS game_events (
  date DATE PRIMARY KEY,
  human_players_peak INTEGER DEFAULT 0,
  bot_count INTEGER DEFAULT 0,
  room_count INTEGER DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  runs_started INTEGER DEFAULT 0,
  deaths_total INTEGER DEFAULT 0,
  revivals_total INTEGER DEFAULT 0,
  avg_play_duration FLOAT DEFAULT 0,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE TABLE IF NOT EXISTS ad_events (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  zone_id VARCHAR(50),
  user_id_hash VARCHAR(64),
  success BOOLEAN,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id UUID REFERENCES admins(id),
  action VARCHAR(50) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  resource_id VARCHAR(36),
  changes JSONB,
  ip_address VARCHAR(45),
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_by UUID REFERENCES admins(id)
);
    `,
    down: `
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS ad_events;
DROP TABLE IF EXISTS game_events;
DROP TABLE IF EXISTS revive_claims;
DROP TABLE IF EXISTS runs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS schema_version;
    `,
  },
  {
    name: '002_create_indexes',
    up: `
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_ip_hash ON sessions(ip_hash);
CREATE INDEX IF NOT EXISTS idx_runs_session_id ON runs(session_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_revive_claims_run_id ON revive_claims(run_id);
CREATE INDEX IF NOT EXISTS idx_revive_claims_status ON revive_claims(status);
CREATE INDEX IF NOT EXISTS idx_revive_claims_expires_at ON revive_claims(expires_at);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ad_events_type ON ad_events(type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
    `,
    down: `
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_ip_hash;
DROP INDEX IF EXISTS idx_runs_session_id;
DROP INDEX IF EXISTS idx_runs_started_at;
DROP INDEX IF EXISTS idx_revive_claims_run_id;
DROP INDEX IF EXISTS idx_revive_claims_status;
DROP INDEX IF EXISTS idx_revive_claims_expires_at;
DROP INDEX IF EXISTS idx_ad_events_created_at;
DROP INDEX IF EXISTS idx_ad_events_type;
DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_audit_logs_admin_id;
    `,
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
  `);

  for (const migration of MIGRATIONS) {
    const existing = await pool.query(
      'SELECT name FROM schema_version WHERE name = $1',
      [migration.name]
    );

    if (existing.rows.length === 0) {
      try {
        await pool.query('BEGIN');
        await pool.query(migration.up);
        await pool.query('INSERT INTO schema_version (name) VALUES ($1)', [
          migration.name,
        ]);
        await pool.query('COMMIT');

        logger.info({ migration: migration.name }, 'Migration applied');
      } catch (err) {
        await pool.query('ROLLBACK');
        logger.error(
          { migration: migration.name, err },
          'Migration failed'
        );
        throw err;
      }
    }
  }
}

export function getMigrations() {
  return MIGRATIONS;
}

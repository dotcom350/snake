import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { query, queryOne } from '../db/index.js';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';

const logger = createChildLogger('admin-auth');
const SESSION_HOURS = 12;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface AdminIdentity {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminIdentity;
  }
}

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), Number(N), Number(r), Number(p), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function ensureBootstrapAdmin(): Promise<void> {
  const { ADMIN_BOOTSTRAP_EMAIL: email, ADMIN_BOOTSTRAP_PASSWORD: password } = config.env;
  const existing = await queryOne<{ n: string }>('SELECT count(*)::text AS n FROM admins');
  if (existing && Number(existing.n) > 0) return;
  if (!email || !password) {
    logger.warn('No admin account exists. Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD and restart to create one.');
    return;
  }
  await query('INSERT INTO admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [
    email.toLowerCase(),
    await hashPassword(password),
  ]);
  logger.info({ email }, 'Bootstrap admin created');
}

export async function adminExists(): Promise<boolean> {
  const row = await queryOne<{ n: string }>('SELECT count(*)::text AS n FROM admins');
  return Number(row?.n ?? 0) > 0;
}

const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginBlocked(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= config.env.ADMIN_RATE_LIMIT_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + config.env.ADMIN_RATE_LIMIT_WINDOW * 1000 });
  } else {
    entry.count++;
  }
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  }
}

const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`;

export async function login(email: string, password: string, ip: string): Promise<{ token: string; admin: AdminIdentity } | null> {
  const row = await queryOne<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM admins WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  // Always run scrypt so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    recordFailure(ip);
    return null;
  }
  attempts.delete(ip);
  const token = randomBytes(32).toString('base64url');
  await query(`INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_HOURS} hours')`, [
    sha256(token),
    row.id,
  ]);
  await query('UPDATE admins SET last_login_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint WHERE id = $1', [row.id]);
  return { token, admin: { id: row.id, email: row.email } };
}

export async function logout(token: string): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256(token)]);
}

export function bearer(request: FastifyRequest): string | null {
  const h = request.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearer(request);
  if (!token) return reply.code(401).send({ error: 'UNAUTHORIZED' });
  const row = await queryOne<{ id: string; email: string }>(
    `SELECT a.id, a.email FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  if (!row) return reply.code(401).send({ error: 'UNAUTHORIZED' });
  request.admin = { id: row.id, email: row.email };
}

export async function changePassword(adminId: string, current: string, next: string, keepToken: string): Promise<boolean> {
  const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM admins WHERE id = $1', [adminId]);
  if (!row || !(await verifyPassword(current, row.password_hash))) return false;
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await hashPassword(next), adminId]);
  await query('DELETE FROM admin_sessions WHERE admin_id = $1 AND token_hash <> $2', [adminId, sha256(keepToken)]);
  return true;
}

export async function audit(adminId: string, action: string, resource: string, changes: unknown, ip: string): Promise<void> {
  await query('INSERT INTO audit_logs (admin_id, action, resource, changes, ip_address) VALUES ($1, $2, $3, $4, $5)', [
    adminId,
    action.slice(0, 50),
    resource.slice(0, 50),
    changes === undefined ? null : JSON.stringify(changes),
    ip.slice(0, 45),
  ]).catch((err) => logger.error({ err }, 'Audit insert failed'));
}

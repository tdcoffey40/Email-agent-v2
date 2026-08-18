import type { User } from '../../shared/types';
import type { Env } from '../env';
import type { UserRow } from './db';
import { hashPassword, newSessionToken, sessionIdFor, verifyPassword } from './crypto';
import { newId, nowSeconds } from './ids';

export const SESSION_COOKIE = 'ea_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * `wrangler dev` runs without secrets unless you create .dev.vars. Falling
 * back keeps local development working; production refuses to start without
 * a real secret (see requireSessionSecret).
 */
export function sessionSecret(env: Env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  throw new Error(
    'SESSION_SECRET is missing or too short. Set it with `wrangler secret put SESSION_SECRET` (32+ random bytes).',
  );
}

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE email_norm = ?')
    .bind(normalizeUserEmail(email))
    .first<UserRow>();
}

export async function createUser(
  env: Env,
  email: string,
  password: string,
  name: string | null,
): Promise<UserRow> {
  const row: UserRow = {
    id: newId('usr'),
    email: email.trim(),
    email_norm: normalizeUserEmail(email),
    name: name?.trim() || null,
    password_hash: await hashPassword(password),
    created_at: nowSeconds(),
  };
  await env.DB.prepare(
    'INSERT INTO users (id, email, email_norm, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(row.id, row.email, row.email_norm, row.name, row.password_hash, row.created_at)
    .run();
  return row;
}

export async function checkPassword(row: UserRow, password: string): Promise<boolean> {
  return verifyPassword(password, row.password_hash);
}

/** Creates a session row and returns the raw token for the cookie. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = newSessionToken();
  const id = await sessionIdFor(token, sessionSecret(env));
  const now = nowSeconds();
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, userId, now + SESSION_TTL_SECONDS, now)
    .run();
  return token;
}

export async function resolveSession(env: Env, token: string | null): Promise<UserRow | null> {
  if (!token) return null;
  let id: string;
  try {
    id = await sessionIdFor(token, sessionSecret(env));
  } catch {
    return null;
  }
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(id, nowSeconds())
    .first<UserRow>();
  return row ?? null;
}

export async function destroySession(env: Env, token: string | null): Promise<void> {
  if (!token) return;
  try {
    const id = await sessionIdFor(token, sessionSecret(env));
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  } catch {
    // A malformed token has no session to destroy.
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Use at least 10 characters.';
  }
  if (password.length > 200) return 'Keep the password under 200 characters.';
  return null;
}

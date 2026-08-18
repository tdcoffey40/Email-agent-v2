import { Hono, type MiddlewareHandler } from 'hono';

import { MODELS } from '../../shared/models';
import type { AgentInput } from '../../shared/types';
import { validateAgentInput } from '../../shared/validation';
import type { Env } from '../env';
import {
  DuplicateAddressError,
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from '../lib/agents';
import {
  SESSION_COOKIE,
  checkPassword,
  clearedSessionCookie,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  normalizeUserEmail,
  readCookie,
  resolveSession,
  sessionCookie,
  toUser,
  validatePasswordStrength,
} from '../lib/auth';
import type { UserRow } from '../lib/db';
import { removeAgentRouting, syncAgentRouting } from '../lib/routing';
import { listMessages, listRecentMessagesForUser, listThreads } from '../lib/threads';
import { isValidEmail } from '../../shared/validation';

type AppEnv = {
  Bindings: Env;
  Variables: { user: UserRow };
};

const api = new Hono<AppEnv>().basePath('/api');

function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === 'https:';
}

/**
 * Session cookies are SameSite=Lax, which already blocks cross-site form
 * posts; this rejects anything that does slip through with a foreign Origin.
 */
api.use('*', async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const origin = c.req.header('origin');
  if (origin) {
    const expected = new URL(c.req.url).origin;
    if (origin !== expected) return c.json({ error: 'Cross-origin request rejected.' }, 403);
  }
  return next();
});

const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readCookie(c.req.header('cookie') ?? null, SESSION_COOKIE);
  let user: UserRow | null = null;
  try {
    user = await resolveSession(c.env, token);
  } catch (error) {
    // A missing SESSION_SECRET is a deployment problem, not a bad login.
    return c.json({ error: error instanceof Error ? error.message : 'Session check failed.' }, 500);
  }
  if (!user) return c.json({ error: 'Not signed in.' }, 401);
  c.set('user', user);
  return next();
};

// ---------------------------------------------------------------- config

api.get('/config', (c) =>
  c.json({
    appName: c.env.APP_NAME,
    emailDomain: c.env.EMAIL_DOMAIN,
    models: MODELS,
    anthropicEnabled: Boolean(c.env.ANTHROPIC_API_KEY?.trim()),
    routingAutomated: Boolean(c.env.CF_API_TOKEN?.trim() && c.env.CF_ZONE_ID?.trim()),
  }),
);

// ------------------------------------------------------------------ auth

interface CredentialsBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

api.post('/auth/register', async (c) => {
  const body = await c.req.json<CredentialsBody>().catch(() => null);
  if (!body) return c.json({ error: 'Expected a JSON body.' }, 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name : null;

  const fields: Record<string, string> = {};
  if (!isValidEmail(email)) fields.email = 'Enter a valid email address.';
  const passwordError = validatePasswordStrength(password);
  if (passwordError) fields.password = passwordError;
  if (Object.keys(fields).length > 0) return c.json({ error: 'Check the form.', fields }, 400);

  const existing = await findUserByEmail(c.env, email);
  if (existing) {
    return c.json(
      { error: 'Check the form.', fields: { email: 'That email is already registered.' } },
      409,
    );
  }

  const user = await createUser(c.env, email, password, name);
  const token = await createSession(c.env, user.id);
  c.header('Set-Cookie', sessionCookie(token, isSecureRequest(c.req.url)));
  return c.json({ user: toUser(user) }, 201);
});

api.post('/auth/login', async (c) => {
  const body = await c.req.json<CredentialsBody>().catch(() => null);
  if (!body) return c.json({ error: 'Expected a JSON body.' }, 400);

  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const user = await findUserByEmail(c.env, normalizeUserEmail(email));
  // Same message either way: whether an address is registered is not public.
  const invalid = { error: 'That email and password do not match.' };
  if (!user) return c.json(invalid, 401);
  if (!(await checkPassword(user, password))) return c.json(invalid, 401);

  const token = await createSession(c.env, user.id);
  c.header('Set-Cookie', sessionCookie(token, isSecureRequest(c.req.url)));
  return c.json({ user: toUser(user) });
});

api.post('/auth/logout', async (c) => {
  const token = readCookie(c.req.header('cookie') ?? null, SESSION_COOKIE);
  await destroySession(c.env, token);
  c.header('Set-Cookie', clearedSessionCookie(isSecureRequest(c.req.url)));
  return c.json({ ok: true });
});

api.get('/auth/me', async (c) => {
  const token = readCookie(c.req.header('cookie') ?? null, SESSION_COOKIE);
  const user = await resolveSession(c.env, token).catch(() => null);
  if (!user) return c.json({ user: null }, 200);
  return c.json({ user: toUser(user) });
});

// ---------------------------------------------------------------- agents

api.use('/agents/*', requireUser);
api.use('/agents', requireUser);
api.use('/threads/*', requireUser);
api.use('/activity', requireUser);

api.get('/agents', async (c) => c.json({ agents: await listAgents(c.env, c.get('user').id) }));

function readAgentBody(raw: unknown): AgentInput {
  const body = (raw ?? {}) as Record<string, unknown>;
  const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  return {
    name: String(body.name ?? ''),
    emailLocal: String(body.emailLocal ?? ''),
    description: String(body.description ?? ''),
    systemPrompt: String(body.systemPrompt ?? ''),
    model: String(body.model ?? ''),
    status: body.status === 'paused' ? 'paused' : 'active',
    skills: asArray(body.skills),
    tools: asArray(body.tools),
    mcpServers: asArray(body.mcpServers),
    allowedSenders: asArray<string>(body.allowedSenders).map((value) => String(value)),
  };
}

api.post('/agents', async (c) => {
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Expected a JSON body.' }, 400);

  const { valid, fields, value } = validateAgentInput(readAgentBody(raw));
  if (!valid) return c.json({ error: 'Check the form.', fields }, 400);

  try {
    const agent = await createAgent(c.env, c.get('user').id, value);
    // Provisioning is awaited so the response carries the real routing state.
    const routed = await syncAgentRouting(c.env, agent);
    return c.json({ agent: routed }, 201);
  } catch (error) {
    if (error instanceof DuplicateAddressError) {
      return c.json(
        { error: 'Check the form.', fields: { emailLocal: 'That address is already taken.' } },
        409,
      );
    }
    throw error;
  }
});

api.get('/agents/:id', async (c) => {
  const agent = await getAgent(c.env, c.req.param('id'), c.get('user').id);
  if (!agent) return c.json({ error: 'Agent not found.' }, 404);
  return c.json({ agent });
});

api.put('/agents/:id', async (c) => {
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Expected a JSON body.' }, 400);

  const { valid, fields, value } = validateAgentInput(readAgentBody(raw));
  if (!valid) return c.json({ error: 'Check the form.', fields }, 400);

  try {
    const agent = await updateAgent(c.env, c.req.param('id'), c.get('user').id, value);
    if (!agent) return c.json({ error: 'Agent not found.' }, 404);
    const routed = await syncAgentRouting(c.env, agent);
    return c.json({ agent: routed });
  } catch (error) {
    if (error instanceof DuplicateAddressError) {
      return c.json(
        { error: 'Check the form.', fields: { emailLocal: 'That address is already taken.' } },
        409,
      );
    }
    throw error;
  }
});

api.delete('/agents/:id', async (c) => {
  const agent = await deleteAgent(c.env, c.req.param('id'), c.get('user').id);
  if (!agent) return c.json({ error: 'Agent not found.' }, 404);
  await removeAgentRouting(c.env, agent);
  return c.json({ ok: true });
});

api.post('/agents/:id/routing/sync', async (c) => {
  const agent = await getAgent(c.env, c.req.param('id'), c.get('user').id);
  if (!agent) return c.json({ error: 'Agent not found.' }, 404);
  return c.json({ agent: await syncAgentRouting(c.env, agent) });
});

// -------------------------------------------------------- threads & logs

api.get('/agents/:id/threads', async (c) => {
  const agent = await getAgent(c.env, c.req.param('id'), c.get('user').id);
  if (!agent) return c.json({ error: 'Agent not found.' }, 404);
  return c.json({ threads: await listThreads(c.env, agent.id) });
});

api.get('/threads/:id/messages', async (c) => {
  const threadId = c.req.param('id');
  // Ownership is enforced through the join, not a separate lookup.
  const owned = await c.env.DB.prepare(
    `SELECT t.id FROM threads t JOIN agents a ON a.id = t.agent_id WHERE t.id = ? AND a.user_id = ?`,
  )
    .bind(threadId, c.get('user').id)
    .first<{ id: string }>();
  if (!owned) return c.json({ error: 'Thread not found.' }, 404);
  return c.json({ messages: await listMessages(c.env, threadId) });
});

api.get('/activity', async (c) =>
  c.json({ messages: await listRecentMessagesForUser(c.env, c.get('user').id) }),
);

api.onError((error, c) => {
  console.error('api error', { path: new URL(c.req.url).pathname, error: String(error) });
  return c.json({ error: 'Something went wrong on the server.' }, 500);
});

api.notFound((c) => c.json({ error: 'Not found.' }, 404));

export default api;

import type { Agent, AgentInput, RoutingStatus } from '../../shared/types';
import type { Env } from '../env';
import { type AgentRow, toAgent } from './db';
import { newId, nowSeconds } from './ids';

const AGENT_COLUMNS = `id, user_id, name, email_local, description, system_prompt, model, status,
  skills, tools, mcp_servers, routing_rule_id, routing_status, routing_error, created_at, updated_at`;

export class DuplicateAddressError extends Error {
  constructor(public readonly emailLocal: string) {
    super(`The address ${emailLocal} is already taken.`);
  }
}

async function sendersFor(env: Env, agentIds: string[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (agentIds.length === 0) return grouped;
  const placeholders = agentIds.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT agent_id, pattern FROM allowed_senders WHERE agent_id IN (${placeholders}) ORDER BY pattern`,
  )
    .bind(...agentIds)
    .all<{ agent_id: string; pattern: string }>();
  for (const row of results ?? []) {
    const list = grouped.get(row.agent_id);
    if (list) list.push(row.pattern);
    else grouped.set(row.agent_id, [row.pattern]);
  }
  return grouped;
}

export async function listAgents(env: Env, userId: string): Promise<Agent[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${AGENT_COLUMNS} FROM agents WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<AgentRow>();
  const rows = results ?? [];
  const senders = await sendersFor(
    env,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toAgent(row, senders.get(row.id) ?? [], env));
}

export async function getAgent(env: Env, id: string, userId: string): Promise<Agent | null> {
  const row = await env.DB.prepare(`SELECT ${AGENT_COLUMNS} FROM agents WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<AgentRow>();
  if (!row) return null;
  const senders = await sendersFor(env, [row.id]);
  return toAgent(row, senders.get(row.id) ?? [], env);
}

/** Used by the email pipeline, where there is no signed-in user. */
export async function getAgentByLocalPart(env: Env, emailLocal: string): Promise<Agent | null> {
  const row = await env.DB.prepare(`SELECT ${AGENT_COLUMNS} FROM agents WHERE email_local = ?`)
    .bind(emailLocal.toLowerCase())
    .first<AgentRow>();
  if (!row) return null;
  const senders = await sendersFor(env, [row.id]);
  return toAgent(row, senders.get(row.id) ?? [], env);
}

function senderStatements(env: Env, agentId: string, patterns: string[]) {
  const now = nowSeconds();
  return patterns.map((pattern) =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO allowed_senders (id, agent_id, pattern, created_at) VALUES (?, ?, ?, ?)',
    ).bind(newId('snd'), agentId, pattern, now),
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: agents.email_local/i.test(error.message);
}

export async function createAgent(env: Env, userId: string, input: AgentInput): Promise<Agent> {
  const id = newId('agt');
  const now = nowSeconds();
  const statements = [
    env.DB.prepare(
      `INSERT INTO agents (id, user_id, name, email_local, description, system_prompt, model, status,
        skills, tools, mcp_servers, routing_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(
      id,
      userId,
      input.name,
      input.emailLocal,
      input.description ?? '',
      input.systemPrompt,
      input.model,
      input.status ?? 'active',
      JSON.stringify(input.skills ?? []),
      JSON.stringify(input.tools ?? []),
      JSON.stringify(input.mcpServers ?? []),
      now,
      now,
    ),
    ...senderStatements(env, id, input.allowedSenders),
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateAddressError(input.emailLocal);
    throw error;
  }

  const agent = await getAgent(env, id, userId);
  if (!agent) throw new Error('Agent disappeared immediately after creation.');
  return agent;
}

export async function updateAgent(
  env: Env,
  id: string,
  userId: string,
  input: AgentInput,
): Promise<Agent | null> {
  const existing = await getAgent(env, id, userId);
  if (!existing) return null;

  const statements = [
    env.DB.prepare(
      `UPDATE agents SET name = ?, email_local = ?, description = ?, system_prompt = ?, model = ?,
         status = ?, skills = ?, tools = ?, mcp_servers = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(
      input.name,
      input.emailLocal,
      input.description ?? '',
      input.systemPrompt,
      input.model,
      input.status ?? 'active',
      JSON.stringify(input.skills ?? []),
      JSON.stringify(input.tools ?? []),
      JSON.stringify(input.mcpServers ?? []),
      nowSeconds(),
      id,
      userId,
    ),
    env.DB.prepare('DELETE FROM allowed_senders WHERE agent_id = ?').bind(id),
    ...senderStatements(env, id, input.allowedSenders),
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateAddressError(input.emailLocal);
    throw error;
  }

  return getAgent(env, id, userId);
}

export async function deleteAgent(env: Env, id: string, userId: string): Promise<Agent | null> {
  const existing = await getAgent(env, id, userId);
  if (!existing) return null;
  await env.DB.prepare('DELETE FROM agents WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return existing;
}

export async function setRoutingState(
  env: Env,
  id: string,
  state: { ruleId?: string | null; status: RoutingStatus; error?: string | null },
): Promise<void> {
  await env.DB.prepare(
    'UPDATE agents SET routing_rule_id = ?, routing_status = ?, routing_error = ?, updated_at = ? WHERE id = ?',
  )
    .bind(state.ruleId ?? null, state.status, state.error ?? null, nowSeconds(), id)
    .run();
}

export async function getRoutingRuleId(env: Env, id: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT routing_rule_id FROM agents WHERE id = ?')
    .bind(id)
    .first<{ routing_rule_id: string | null }>();
  return row?.routing_rule_id ?? null;
}

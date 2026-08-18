import type { Agent } from '../../shared/types';
import { type Env, workerName } from '../env';
import { setRoutingState } from './agents';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 10_000;

interface CloudflareResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

interface RoutingRule {
  tag: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchers: { type: string; field?: string; value?: string }[];
  actions: { type: string; value: string[] }[];
}

export interface RoutingCredentials {
  token: string;
  zoneId: string;
}

/**
 * Per-address rules are optional: with the zone's catch-all pointed at this
 * Worker, every agent address already arrives here. When credentials are
 * present we provision explicit rules so the Cloudflare dashboard shows one
 * entry per agent and unknown addresses can be rejected at the edge.
 */
export function routingCredentials(env: Env): RoutingCredentials | null {
  const token = env.CF_API_TOKEN?.trim();
  const zoneId = env.CF_ZONE_ID?.trim();
  if (!token || !zoneId) return null;
  return { token, zoneId };
}

async function callApi<T>(
  creds: RoutingCredentials,
  path: string,
  init: RequestInit = {},
): Promise<CloudflareResponse<T>> {
  const response = await fetch(`${API_BASE}/zones/${creds.zoneId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as CloudflareResponse<T> | null;
  if (!body) {
    throw new Error(`Cloudflare API returned ${response.status} with an unreadable body.`);
  }
  if (!response.ok || !body.success) {
    const detail = body.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return body;
}

function ruleBody(agent: Agent, address: string, worker: string) {
  return {
    name: `agent:${agent.id}`,
    enabled: agent.status === 'active',
    priority: 0,
    matchers: [{ type: 'literal', field: 'to', value: address }],
    actions: [{ type: 'worker', value: [worker] }],
  };
}

/**
 * Make the zone's routing match this agent. Never throws: a routing failure
 * is recorded on the agent so the UI can surface it, because the agent row
 * itself saved fine.
 */
export async function syncAgentRouting(env: Env, agent: Agent): Promise<Agent> {
  const creds = routingCredentials(env);
  if (!creds) {
    const note =
      'No Cloudflare API credentials configured. Point the zone catch-all at this Worker, or set CF_API_TOKEN and CF_ZONE_ID to provision per-address rules.';
    await setRoutingState(env, agent.id, { ruleId: null, status: 'disabled', error: note });
    return { ...agent, routingStatus: 'disabled', routingError: note };
  }

  try {
    const worker = workerName(env);
    const body = ruleBody(agent, agent.address, worker);
    const existingTag = await findRuleTag(creds, agent);

    const result = existingTag
      ? await callApi<RoutingRule>(creds, `/email/routing/rules/${existingTag}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      : await callApi<RoutingRule>(creds, '/email/routing/rules', {
          method: 'POST',
          body: JSON.stringify(body),
        });

    const tag = result.result?.tag ?? existingTag ?? null;
    const status = agent.status === 'active' ? 'active' : 'disabled';
    await setRoutingState(env, agent.id, { ruleId: tag, status, error: null });
    return { ...agent, routingStatus: status, routingError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setRoutingState(env, agent.id, { status: 'error', error: message });
    return { ...agent, routingStatus: 'error', routingError: message };
  }
}

/**
 * Find the rule for this agent, preferring the stored tag and falling back to
 * a name match so a rule is never orphaned when the tag is lost.
 */
async function findRuleTag(creds: RoutingCredentials, agent: Agent): Promise<string | null> {
  const { result } = await callApi<RoutingRule[]>(creds, '/email/routing/rules?per_page=200');
  const rules = result ?? [];
  const byName = rules.find((rule) => rule.name === `agent:${agent.id}`);
  if (byName) return byName.tag;
  const byAddress = rules.find((rule) =>
    rule.matchers?.some((m) => m.field === 'to' && m.value?.toLowerCase() === agent.address),
  );
  return byAddress?.tag ?? null;
}

export async function removeAgentRouting(env: Env, agent: Agent): Promise<void> {
  const creds = routingCredentials(env);
  if (!creds) return;
  try {
    const tag = await findRuleTag(creds, agent);
    if (!tag) return;
    await callApi(creds, `/email/routing/rules/${tag}`, { method: 'DELETE' });
  } catch {
    // The agent is gone either way; a stale rule simply routes to an address
    // the email handler will no longer recognise, and it rejects cleanly.
  }
}

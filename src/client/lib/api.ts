import type { Agent, AgentInput, Message, ModelOption, Thread, User } from '@shared/types';

export interface AppConfig {
  appName: string;
  emailDomain: string;
  models: ModelOption[];
  anthropicEnabled: boolean;
  routingAutomated: boolean;
}

/** An API error that carries field-level messages back to the form. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiRequestError('Could not reach the server. Check your connection.', 0);
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; fields?: Record<string, string> })
    | null;

  if (!response.ok) {
    throw new ApiRequestError(
      payload?.error ?? `Request failed (${response.status}).`,
      response.status,
      payload?.fields ?? {},
    );
  }
  if (payload === null) throw new ApiRequestError('The server sent an unreadable response.', response.status);
  return payload;
}

const postJson = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  config: () => request<AppConfig>('/config'),

  me: () => request<{ user: User | null }>('/auth/me'),
  login: (email: string, password: string) =>
    postJson<{ user: User }>('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    postJson<{ user: User }>('/auth/register', { email, password, name }),
  logout: () => postJson<{ ok: true }>('/auth/logout', {}),

  listAgents: () => request<{ agents: Agent[] }>('/agents'),
  getAgent: (id: string) => request<{ agent: Agent }>(`/agents/${id}`),
  createAgent: (input: AgentInput) => postJson<{ agent: Agent }>('/agents', input),
  updateAgent: (id: string, input: AgentInput) =>
    request<{ agent: Agent }>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteAgent: (id: string) => request<{ ok: true }>(`/agents/${id}`, { method: 'DELETE' }),
  syncRouting: (id: string) => postJson<{ agent: Agent }>(`/agents/${id}/routing/sync`, {}),

  listThreads: (agentId: string) => request<{ threads: Thread[] }>(`/agents/${agentId}/threads`),
  listMessages: (threadId: string) => request<{ messages: Message[] }>(`/threads/${threadId}/messages`),
  activity: () => request<{ messages: Message[] }>('/activity'),
};

import type { Agent, AgentSkill, AgentTool, McpServer, Message, Thread } from '../../shared/types';
import type { Env } from '../env';
import { agentAddress } from '../env';

export interface UserRow {
  id: string;
  email: string;
  email_norm: string;
  name: string | null;
  password_hash: string;
  created_at: number;
}

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  email_local: string;
  description: string;
  system_prompt: string;
  model: string;
  status: string;
  skills: string;
  tools: string;
  mcp_servers: string;
  routing_rule_id: string | null;
  routing_status: string;
  routing_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface ThreadRow {
  id: string;
  agent_id: string;
  participant: string;
  subject: string;
  created_at: number;
  last_activity_at: number;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  agent_id: string;
  direction: string;
  status: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  refs: string | null;
  body: string;
  error: string | null;
  created_at: number;
}

/** JSON columns are written by us, but never trust them on the way out. */
function parseJsonArray<T>(raw: string | null, guard: (value: unknown) => value is T): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

const isSkill = (v: unknown): v is AgentSkill =>
  typeof v === 'object' && v !== null && typeof (v as AgentSkill).name === 'string';
const isTool = (v: unknown): v is AgentTool =>
  typeof v === 'object' && v !== null && typeof (v as AgentTool).name === 'string';
const isMcpServer = (v: unknown): v is McpServer =>
  typeof v === 'object' && v !== null && typeof (v as McpServer).url === 'string';

export function parseSkills(raw: string | null): AgentSkill[] {
  return parseJsonArray(raw, isSkill);
}
export function parseTools(raw: string | null): AgentTool[] {
  return parseJsonArray(raw, isTool);
}
export function parseMcpServers(raw: string | null): McpServer[] {
  return parseJsonArray(raw, isMcpServer);
}

export function toAgent(row: AgentRow, allowedSenders: string[], env: Env): Agent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    emailLocal: row.email_local,
    address: agentAddress(env, row.email_local),
    description: row.description,
    systemPrompt: row.system_prompt,
    model: row.model,
    status: row.status === 'paused' ? 'paused' : 'active',
    skills: parseSkills(row.skills),
    tools: parseTools(row.tools),
    mcpServers: parseMcpServers(row.mcp_servers),
    allowedSenders,
    routingStatus: (row.routing_status as Agent['routingStatus']) ?? 'pending',
    routingError: row.routing_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toThread(row: ThreadRow, messageCount: number): Thread {
  return {
    id: row.id,
    agentId: row.agent_id,
    participant: row.participant,
    subject: row.subject,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    messageCount,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    agentId: row.agent_id,
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
    status: row.status as Message['status'],
    from: row.from_addr,
    to: row.to_addr,
    subject: row.subject,
    body: row.body,
    error: row.error,
    createdAt: row.created_at,
  };
}

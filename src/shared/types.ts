/** Types shared by the Worker API and the React client. */

export type AgentStatus = 'active' | 'paused';
export type RoutingStatus = 'pending' | 'active' | 'error' | 'disabled';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'received' | 'rejected' | 'replied' | 'failed';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: number;
}

/** A tool the agent may call. Execution lands in a later pass. */
export interface AgentTool {
  name: string;
  description?: string;
  enabled: boolean;
}

/** A named instruction bundle layered onto the system prompt. */
export interface AgentSkill {
  name: string;
  instructions: string;
  enabled: boolean;
}

/** A remote MCP server the agent may connect to. */
export interface McpServer {
  name: string;
  url: string;
  transport: 'sse' | 'http';
  enabled: boolean;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  /** Local part only. The full address is `${emailLocal}@${emailDomain}`. */
  emailLocal: string;
  /** Convenience: the full address, resolved server side. */
  address: string;
  description: string;
  systemPrompt: string;
  model: string;
  status: AgentStatus;
  skills: AgentSkill[];
  tools: AgentTool[];
  mcpServers: McpServer[];
  allowedSenders: string[];
  routingStatus: RoutingStatus;
  routingError: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Everything the agent editor can submit. */
export interface AgentInput {
  name: string;
  emailLocal: string;
  description?: string;
  systemPrompt: string;
  model: string;
  status?: AgentStatus;
  skills?: AgentSkill[];
  tools?: AgentTool[];
  mcpServers?: McpServer[];
  allowedSenders: string[];
}

export interface Thread {
  id: string;
  agentId: string;
  participant: string;
  subject: string;
  createdAt: number;
  lastActivityAt: number;
  messageCount: number;
}

export interface Message {
  id: string;
  threadId: string;
  agentId: string;
  direction: MessageDirection;
  status: MessageStatus;
  from: string;
  to: string;
  subject: string;
  body: string;
  error: string | null;
  createdAt: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: 'workers-ai' | 'anthropic';
  description: string;
}

export interface ApiError {
  error: string;
  /** Field-level messages, keyed by input name. */
  fields?: Record<string, string>;
}

import type { Message, MessageDirection, MessageStatus, Thread } from '../../shared/types';
import type { Env } from '../env';
import { type MessageRow, type ThreadRow, toMessage, toThread } from './db';
import type { ChatMessage } from './llm';
import { newId, nowSeconds } from './ids';

/** How many past messages of a thread are replayed to the model. */
export const HISTORY_LIMIT = 20;

/**
 * Find the thread a reply belongs to by looking up any Message-ID it
 * references. This is what keeps a back-and-forth on one thread.
 */
export async function findThreadByReferences(
  env: Env,
  agentId: string,
  messageIds: string[],
): Promise<ThreadRow | null> {
  const ids = messageIds.filter(Boolean);
  if (ids.length === 0) return null;
  const placeholders = ids.map(() => '?').join(', ');
  const row = await env.DB.prepare(
    `SELECT t.* FROM messages m
     JOIN threads t ON t.id = m.thread_id
     WHERE m.agent_id = ? AND m.rfc_message_id IN (${placeholders})
     ORDER BY m.created_at DESC LIMIT 1`,
  )
    .bind(agentId, ...ids)
    .first<ThreadRow>();
  return row ?? null;
}

export async function createThread(
  env: Env,
  input: { agentId: string; participant: string; subject: string },
): Promise<ThreadRow> {
  const now = nowSeconds();
  const row: ThreadRow = {
    id: newId('thr'),
    agent_id: input.agentId,
    participant: input.participant,
    subject: input.subject,
    created_at: now,
    last_activity_at: now,
  };
  await env.DB.prepare(
    'INSERT INTO threads (id, agent_id, participant, subject, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(row.id, row.agent_id, row.participant, row.subject, row.created_at, row.last_activity_at)
    .run();
  return row;
}

export async function touchThread(env: Env, threadId: string): Promise<void> {
  await env.DB.prepare('UPDATE threads SET last_activity_at = ? WHERE id = ?')
    .bind(nowSeconds(), threadId)
    .run();
}

export interface RecordMessageInput {
  threadId: string;
  agentId: string;
  direction: MessageDirection;
  status: MessageStatus;
  from: string;
  to: string;
  subject: string;
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  body: string;
  error?: string | null;
}

export async function recordMessage(env: Env, input: RecordMessageInput): Promise<MessageRow> {
  const row: MessageRow = {
    id: newId('msg'),
    thread_id: input.threadId,
    agent_id: input.agentId,
    direction: input.direction,
    status: input.status,
    from_addr: input.from,
    to_addr: input.to,
    subject: input.subject,
    rfc_message_id: input.rfcMessageId ?? null,
    in_reply_to: input.inReplyTo ?? null,
    refs: input.references?.length ? input.references.join(' ') : null,
    body: input.body,
    error: input.error ?? null,
    created_at: nowSeconds(),
  };
  await env.DB.prepare(
    `INSERT INTO messages (id, thread_id, agent_id, direction, status, from_addr, to_addr, subject,
       rfc_message_id, in_reply_to, refs, body, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      row.thread_id,
      row.agent_id,
      row.direction,
      row.status,
      row.from_addr,
      row.to_addr,
      row.subject,
      row.rfc_message_id,
      row.in_reply_to,
      row.refs,
      row.body,
      row.error,
      row.created_at,
    )
    .run();
  await touchThread(env, input.threadId);
  return row;
}

/**
 * Past turns of the thread as model messages. Rejected and failed messages
 * are skipped: they were never part of the conversation the human saw.
 */
export async function threadHistory(
  env: Env,
  threadId: string,
  limit = HISTORY_LIMIT,
): Promise<ChatMessage[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM messages
     WHERE thread_id = ? AND status IN ('received', 'replied')
     ORDER BY created_at DESC, rowid DESC LIMIT ?`,
  )
    .bind(threadId, limit)
    .all<MessageRow>();

  return (results ?? [])
    .reverse()
    .map((row) => ({
      role: row.direction === 'outbound' ? ('assistant' as const) : ('user' as const),
      content: row.body,
    }))
    .filter((message) => message.content.trim().length > 0);
}

export async function listThreads(env: Env, agentId: string, limit = 50): Promise<Thread[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.*, COUNT(m.id) AS message_count FROM threads t
     LEFT JOIN messages m ON m.thread_id = t.id
     WHERE t.agent_id = ?
     GROUP BY t.id
     ORDER BY t.last_activity_at DESC LIMIT ?`,
  )
    .bind(agentId, limit)
    .all<ThreadRow & { message_count: number }>();
  return (results ?? []).map((row) => toThread(row, row.message_count ?? 0));
}

export async function listMessages(env: Env, threadId: string, limit = 200): Promise<Message[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?',
  )
    .bind(threadId, limit)
    .all<MessageRow>();
  return (results ?? []).map(toMessage);
}

/** Recent activity across every agent the user owns, for the dashboard. */
export async function listRecentMessagesForUser(
  env: Env,
  userId: string,
  limit = 50,
): Promise<Message[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.* FROM messages m
     JOIN agents a ON a.id = m.agent_id
     WHERE a.user_id = ?
     ORDER BY m.created_at DESC LIMIT ?`,
  )
    .bind(userId, limit)
    .all<MessageRow>();
  return (results ?? []).map(toMessage);
}

/**
 * Rejected messages are logged so the owner can see who was turned away, but
 * that write happens before the sender is trusted. Counting recent rejections
 * lets the caller stop an unknown sender from filling the table.
 */
export async function countRecentRejections(
  env: Env,
  agentId: string,
  windowSeconds = 3600,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM messages
     WHERE agent_id = ? AND status = 'rejected' AND created_at > ?`,
  )
    .bind(agentId, nowSeconds() - windowSeconds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

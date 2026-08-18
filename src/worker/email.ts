import PostalMime, { type Email } from 'postal-mime';
import { EmailMessage } from 'cloudflare:email';

import { extractAddress } from '../shared/validation';
import type { Agent } from '../shared/types';
import type { Env } from './env';
import { getAgentByLocalPart } from './lib/agents';
import { runAgent } from './lib/agentRunner';
import {
  buildReferences,
  htmlToText,
  localPartOf,
  newMessageId,
  normalizeMessageId,
  parseReferences,
  replySubject,
  stripQuotedText,
  truncate,
} from './lib/mail';
import { automatedReason, senderDenialReason } from './lib/policy';
import { buildReplyMime } from './lib/reply';
import {
  countRecentRejections,
  createThread,
  findThreadByReferences,
  recordMessage,
  threadHistory,
} from './lib/threads';

/** Refuse anything larger than this before parsing it. */
const MAX_RAW_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Ceiling on rejection rows written per agent per hour. Rejections are logged
 * before the sender is trusted, so without a cap anyone could pad the table
 * by mailing an address repeatedly.
 */
const MAX_LOGGED_REJECTIONS_PER_HOUR = 50;

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const envelopeFrom = extractAddress(message.from);
  const recipient = extractAddress(message.to);
  const localPart = localPartOf(recipient);

  const agent = await getAgentByLocalPart(env, localPart);
  if (!agent) {
    message.setReject(`No agent is registered at ${recipient}.`);
    return;
  }
  if (agent.status !== 'active') {
    message.setReject(`The agent at ${recipient} is paused and is not accepting mail.`);
    return;
  }
  if (message.rawSize > MAX_RAW_SIZE_BYTES) {
    message.setReject('Message is too large. The limit is 5 MB.');
    return;
  }

  let parsed: Email;
  try {
    parsed = await PostalMime.parse(message.raw);
  } catch (error) {
    message.setReject('The message could not be parsed as email.');
    console.error('email parse failed', { agentId: agent.id, error: String(error) });
    return;
  }

  const headerFrom = extractAddress(parsed.from?.address ?? '');
  const subject = (parsed.subject ?? '').trim();

  const denial = senderDenialReason(agent, message.headers, envelopeFrom, headerFrom);
  if (denial) {
    await logRejection(env, agent, {
      from: headerFrom || envelopeFrom,
      to: recipient,
      subject,
      body: extractBody(parsed),
      reason: denial,
    });
    message.setReject(denial);
    return;
  }

  // An auto-reply answering an auto-reply is how mail loops start.
  const automated = automatedReason(message.headers, envelopeFrom, agent.address);
  if (automated) {
    await logRejection(env, agent, {
      from: headerFrom || envelopeFrom,
      to: recipient,
      subject,
      body: extractBody(parsed),
      reason: automated,
    });
    return;
  }

  const sender = headerFrom || envelopeFrom;
  const incomingMessageId = normalizeMessageId(parsed.messageId);
  const inReplyTo = normalizeMessageId(parsed.inReplyTo);
  const references = parseReferences(parsed.references);

  // A reply belongs to the thread of any message it references.
  const lookupIds = [...references, inReplyTo, incomingMessageId].filter(
    (id): id is string => Boolean(id),
  );
  const existingThread = await findThreadByReferences(env, agent.id, lookupIds);
  const thread =
    existingThread ?? (await createThread(env, { agentId: agent.id, participant: sender, subject }));

  const body = truncate(stripQuotedText(extractBody(parsed)));

  // History is read before the new message is stored so the prompt gets the
  // prior turns exactly once.
  const history = existingThread ? await threadHistory(env, thread.id) : [];

  await recordMessage(env, {
    threadId: thread.id,
    agentId: agent.id,
    direction: 'inbound',
    status: 'received',
    from: sender,
    to: recipient,
    subject,
    rfcMessageId: incomingMessageId,
    inReplyTo,
    references,
    body,
  });

  let replyText: string;
  try {
    replyText = await runAgent(env, agent, {
      address: agent.address,
      sender,
      subject,
      history,
      incoming: body,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordMessage(env, {
      threadId: thread.id,
      agentId: agent.id,
      direction: 'outbound',
      status: 'failed',
      from: agent.address,
      to: sender,
      subject: replySubject(subject),
      body: '',
      error: reason,
    });
    console.error('agent run failed', { agentId: agent.id, threadId: thread.id, reason });
    // Surface the failure to the sender rather than swallowing their message.
    message.setReject('The agent could not produce a reply. Please try again later.');
    return;
  }

  const outgoingId = newMessageId(env.EMAIL_DOMAIN);
  const outgoingRefs = buildReferences(references, incomingMessageId);
  const outSubject = replySubject(subject);

  try {
    const raw = buildReplyMime({
      from: agent.address,
      fromName: agent.name,
      to: sender,
      subject: outSubject,
      body: replyText,
      messageId: outgoingId,
      inReplyTo: incomingMessageId,
      references: outgoingRefs,
    });
    await message.reply(new EmailMessage(agent.address, sender, raw));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordMessage(env, {
      threadId: thread.id,
      agentId: agent.id,
      direction: 'outbound',
      status: 'failed',
      from: agent.address,
      to: sender,
      subject: outSubject,
      body: replyText,
      error: reason,
    });
    console.error('reply send failed', { agentId: agent.id, threadId: thread.id, reason });
    return;
  }

  await recordMessage(env, {
    threadId: thread.id,
    agentId: agent.id,
    direction: 'outbound',
    status: 'replied',
    from: agent.address,
    to: sender,
    subject: outSubject,
    rfcMessageId: outgoingId,
    inReplyTo: incomingMessageId,
    references: outgoingRefs,
    body: replyText,
  });
}

function extractBody(parsed: Email): string {
  const text = (parsed.text ?? '').trim();
  if (text) return text;
  const html = (parsed.html ?? '').trim();
  return html ? htmlToText(html) : '';
}

async function logRejection(
  env: Env,
  agent: Agent,
  input: { from: string; to: string; subject: string; body: string; reason: string },
): Promise<void> {
  try {
    if ((await countRecentRejections(env, agent.id)) >= MAX_LOGGED_REJECTIONS_PER_HOUR) {
      console.warn('rejection log capped for this hour', { agentId: agent.id });
      return;
    }
    const thread = await createThread(env, {
      agentId: agent.id,
      participant: input.from || 'unknown',
      subject: input.subject,
    });
    await recordMessage(env, {
      threadId: thread.id,
      agentId: agent.id,
      direction: 'inbound',
      status: 'rejected',
      from: input.from || 'unknown',
      to: input.to,
      subject: input.subject,
      body: truncate(input.body, 2000),
      error: input.reason,
    });
  } catch (error) {
    // Logging must never mask the rejection itself.
    console.error('failed to log rejected message', { agentId: agent.id, error: String(error) });
  }
}

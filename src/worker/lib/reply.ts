import { createMimeMessage } from 'mimetext/browser';

export interface ReplyMimeInput {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
}

/**
 * Build the reply so mail clients file it under the original conversation:
 * In-Reply-To names the message being answered, References carries the whole
 * chain (RFC 5322 §3.6.4).
 */
export function buildReplyMime(input: ReplyMimeInput): string {
  const msg = createMimeMessage();
  msg.setSender({ name: input.fromName, addr: input.from });
  msg.setRecipient(input.to);
  msg.setSubject(input.subject);
  msg.setHeader('Message-ID', input.messageId);
  if (input.inReplyTo) msg.setHeader('In-Reply-To', input.inReplyTo);
  if (input.references.length > 0) msg.setHeader('References', input.references.join(' '));
  // Tells other autoresponders to stay quiet (RFC 3834).
  msg.setHeader('Auto-Submitted', 'auto-replied');
  msg.addMessage({ contentType: 'text/plain', data: input.body });
  return msg.asRaw();
}

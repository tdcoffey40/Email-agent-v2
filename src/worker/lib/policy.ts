import type { Agent } from '../../shared/types';
import { findMatchingPattern } from '../../shared/validation';
import { isSenderForged, parseAuthResults } from './mail';

/** Just the header lookup these checks need, so they stay testable. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The allowlist check. Both the envelope sender and the From header must be
 * allowed: the envelope alone lets a permitted relay present any identity in
 * the header, and the header alone is trivially forged.
 *
 * Returns the reason to reject, or null when the message may proceed.
 */
export function senderDenialReason(
  agent: Agent,
  headers: HeaderReader,
  envelopeFrom: string,
  headerFrom: string,
): string | null {
  const auth = parseAuthResults(headers.get('authentication-results'));
  if (isSenderForged(auth)) {
    return 'Message failed SPF/DMARC authentication and cannot be trusted.';
  }

  if (!envelopeFrom) return 'Message has no usable sender address.';
  if (!findMatchingPattern(envelopeFrom, agent.allowedSenders)) {
    return `${envelopeFrom} is not on the allowed senders list for this agent.`;
  }

  if (headerFrom && headerFrom !== envelopeFrom) {
    if (!findMatchingPattern(headerFrom, agent.allowedSenders)) {
      return `${headerFrom} is not on the allowed senders list for this agent.`;
    }
  }

  return null;
}

/**
 * Detect mail that must not be answered, so two autoresponders never
 * ping-pong a mailbox to death.
 */
export function automatedReason(
  headers: HeaderReader,
  envelopeFrom: string,
  agentAddress: string,
): string | null {
  if (!envelopeFrom) return 'Bounce message (empty envelope sender); not replying.';
  if (envelopeFrom === agentAddress) return 'Message came from the agent itself; not replying.';

  const autoSubmitted = headers.get('auto-submitted')?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') {
    return `Auto-submitted message (${autoSubmitted}); not replying.`;
  }
  if (headers.get('x-auto-response-suppress')) {
    return 'Sender requested auto-response suppression; not replying.';
  }
  if (headers.get('list-id') || headers.get('list-unsubscribe')) {
    return 'Mailing list message; not replying.';
  }
  const precedence = headers.get('precedence')?.toLowerCase();
  if (precedence && ['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) {
    return `Precedence: ${precedence}; not replying.`;
  }
  return null;
}

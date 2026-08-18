/** Pure helpers for reading inbound mail and shaping the reply. */

export const MAX_BODY_CHARS = 16_000;

/** Collapse an HTML part down to something a model can read. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const QUOTE_MARKERS = [
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^_{5,}$/,
  /^From:\s.+$/i,
  /^On\s.+\swrote:\s*$/i,
  /^Sent from my /i,
];

/**
 * Drop the quoted chain from a reply. Thread history is reconstructed from
 * our own records, so the quote is redundant context that crowds the prompt.
 */
export function stripQuotedText(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (QUOTE_MARKERS.some((marker) => marker.test(trimmed))) break;
    // `On <date>, <name>` can wrap onto the following line before `wrote:`.
    if (/^On\s.+,$/i.test(trimmed) && /wrote:\s*$/i.test((lines[i + 1] ?? '').trim())) break;
    if (trimmed === '--' || trimmed === '-- ') break;
    if (trimmed.startsWith('>')) continue;

    kept.push(line);
  }

  const result = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // If stripping ate the whole message, the original is the better input.
  return result || text.trim();
}

export function truncate(text: string, limit = MAX_BODY_CHARS): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[message truncated at ${limit} characters]`;
}

export function replySubject(subject: string): string {
  const clean = (subject || '').trim();
  if (!clean) return 'Re: (no subject)';
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

/** Normalise a Message-ID to its angle-bracketed form. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<[^<>\s]+>/);
  if (match) return match[0];
  const trimmed = value.trim();
  return trimmed ? `<${trimmed.replace(/^<|>$/g, '')}>` : null;
}

/** All Message-IDs in a References header, oldest first. */
export function parseReferences(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.match(/<[^<>\s]+>/g) ?? [];
}

/**
 * References for our reply: the chain we were given, plus the message we are
 * replying to (RFC 5322 §3.6.4).
 */
export function buildReferences(
  incomingReferences: string[],
  incomingMessageId: string | null,
): string[] {
  const chain = [...incomingReferences];
  if (incomingMessageId && !chain.includes(incomingMessageId)) chain.push(incomingMessageId);
  // Keep the head and the most recent entries; long chains get unwieldy.
  return chain.length > 20 ? [chain[0], ...chain.slice(-19)] : chain;
}

export function newMessageId(domain: string): string {
  const random = crypto.randomUUID();
  return `<${random}@${domain}>`;
}

/** The local part of an address, lowercased, with any +tag removed. */
export function localPartOf(address: string): string {
  const at = address.lastIndexOf('@');
  const local = (at === -1 ? address : address.slice(0, at)).toLowerCase();
  const plus = local.indexOf('+');
  return plus === -1 ? local : local.slice(0, plus);
}

export interface AuthResults {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

/**
 * Read the Authentication-Results header Cloudflare adds upstream. An
 * allowlist is only as good as the sender's identity, so a hard SPF or DMARC
 * failure has to be treated as a forged sender.
 */
export function parseAuthResults(header: string | null | undefined): AuthResults {
  const value = (header ?? '').toLowerCase();
  const read = (method: string): string | null => {
    const match = value.match(new RegExp(`\\b${method}=([a-z]+)`));
    return match ? match[1] : null;
  };
  return { spf: read('spf'), dkim: read('dkim'), dmarc: read('dmarc') };
}

/** A verdict of `fail` on SPF or DMARC means the sender cannot be trusted. */
export function isSenderForged(results: AuthResults): boolean {
  return results.dmarc === 'fail' || results.spf === 'fail';
}

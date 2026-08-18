import type { AgentInput } from './types';
import { findModel } from './models';

/**
 * Local parts that belong to the mail system itself (RFC 2142) and must keep
 * reaching a human. Role addresses people plausibly want an agent for —
 * support, sales, security — are deliberately not reserved.
 */
export const RESERVED_LOCAL_PARTS = new Set([
  'abuse',
  'hostmaster',
  'mailer-daemon',
  'no-reply',
  'noreply',
  'postmaster',
  'webmaster',
]);

export const MAX_ALLOWED_SENDERS = 100;
const EMAIL_RE = /^[^\s@,<>"]+@[^\s@,<>".]+(\.[^\s@,<>".]+)+$/;
const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * Pull the bare address out of a header value such as
 * `"Ada Lovelace" <ada@example.com>` and lowercase it.
 */
export function extractAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  const value = raw.trim();
  const angled = value.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : value).trim();
  // A header may carry several addresses; the first one is the sender.
  const first = address.split(',')[0].trim();
  return first.replace(/^["']|["']$/g, '').toLowerCase();
}

export function isValidEmail(address: string): boolean {
  return EMAIL_RE.test(address.trim());
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
}

/**
 * Normalise a proposed local part: lowercase, spaces and underscores become
 * hyphens, anything else unsupported is dropped.
 */
export function normalizeLocalPart(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function validateLocalPart(local: string): string | null {
  if (!local) return 'Pick an address for this agent.';
  if (!LOCAL_PART_RE.test(local)) {
    return 'Use 1-32 lowercase letters, numbers or hyphens, starting and ending with a letter or number.';
  }
  if (RESERVED_LOCAL_PARTS.has(local)) return `"${local}" is reserved by the mail system.`;
  return null;
}

/**
 * Accepted allowlist forms:
 *   ada@example.com   exact address
 *   *@example.com     any sender at that domain
 *   *@*.example.com   any sender at any subdomain of that domain
 *   *                 anyone (an open agent — the UI warns about this)
 */
export function validateSenderPattern(pattern: string): string | null {
  const value = pattern.trim().toLowerCase();
  if (!value) return 'Enter an address or pattern.';
  if (value === '*') return null;
  if (value.startsWith('*@')) {
    const domain = value.slice(2);
    const bare = domain.startsWith('*.') ? domain.slice(2) : domain;
    if (!bare.includes('.') || /[\s@,<>"*]/.test(bare)) return `"${pattern}" is not a valid domain pattern.`;
    return null;
  }
  if (!isValidEmail(value)) return `"${pattern}" is not a valid email address.`;
  return null;
}

export function normalizeSenderPattern(pattern: string): string {
  const value = pattern.trim().toLowerCase();
  // `@example.com` is a natural thing to type; treat it as `*@example.com`.
  if (value.startsWith('@')) return `*${value}`;
  return value;
}

/**
 * True when `sender` is covered by `pattern`. Both sides are expected to be
 * normalised already; the sender must be a bare lowercase address.
 */
export function patternMatches(pattern: string, sender: string): boolean {
  const p = pattern.trim().toLowerCase();
  const s = sender.trim().toLowerCase();
  if (!p || !s) return false;
  if (p === '*') return true;

  if (p.startsWith('*@')) {
    const domain = p.slice(2);
    const senderDomain = domainOf(s);
    if (!senderDomain) return false;
    if (domain.startsWith('*.')) {
      const base = domain.slice(2);
      // A subdomain wildcard covers sub.example.com but not example.com.
      return senderDomain.endsWith(`.${base}`);
    }
    return senderDomain === domain;
  }

  return p === s;
}

/** The first pattern that admits this sender, or null when none does. */
export function findMatchingPattern(sender: string, patterns: string[]): string | null {
  const normalized = extractAddress(sender);
  if (!normalized) return null;
  for (const pattern of patterns) {
    if (patternMatches(normalizeSenderPattern(pattern), normalized)) return pattern;
  }
  return null;
}

export function isSenderAllowed(sender: string, patterns: string[]): boolean {
  return findMatchingPattern(sender, patterns) !== null;
}

export interface ValidationResult {
  valid: boolean;
  fields: Record<string, string>;
  /** Input with local part and sender patterns normalised. */
  value: AgentInput;
}

export function validateAgentInput(input: AgentInput): ValidationResult {
  const fields: Record<string, string> = {};

  const name = (input.name ?? '').trim();
  if (!name) fields.name = 'Give the agent a name.';
  else if (name.length > 80) fields.name = 'Keep the name under 80 characters.';

  const emailLocal = normalizeLocalPart(input.emailLocal ?? '');
  const localError = validateLocalPart(emailLocal);
  if (localError) fields.emailLocal = localError;

  const systemPrompt = (input.systemPrompt ?? '').trim();
  if (!systemPrompt) fields.systemPrompt = 'Write the prompt that tells this agent what to do.';
  else if (systemPrompt.length > 20000) fields.systemPrompt = 'Keep the prompt under 20,000 characters.';

  const model = (input.model ?? '').trim();
  if (!model) fields.model = 'Choose a model.';
  else if (!findModel(model)) fields.model = 'That model is not available.';

  const rawSenders = input.allowedSenders ?? [];
  const allowedSenders: string[] = [];
  const seen = new Set<string>();
  if (rawSenders.length === 0) {
    fields.allowedSenders = 'Add at least one allowed sender, or the agent can never be reached.';
  } else if (rawSenders.length > MAX_ALLOWED_SENDERS) {
    fields.allowedSenders = `Up to ${MAX_ALLOWED_SENDERS} allowed senders.`;
  } else {
    for (const raw of rawSenders) {
      const pattern = normalizeSenderPattern(String(raw));
      const error = validateSenderPattern(pattern);
      if (error) {
        fields.allowedSenders = error;
        break;
      }
      if (!seen.has(pattern)) {
        seen.add(pattern);
        allowedSenders.push(pattern);
      }
    }
  }

  const status = input.status === 'paused' ? 'paused' : 'active';

  return {
    valid: Object.keys(fields).length === 0,
    fields,
    value: {
      name,
      emailLocal,
      description: (input.description ?? '').trim().slice(0, 500),
      systemPrompt,
      model,
      status,
      skills: (input.skills ?? []).slice(0, 50),
      tools: (input.tools ?? []).slice(0, 50),
      mcpServers: (input.mcpServers ?? []).slice(0, 20),
      allowedSenders,
    },
  };
}

import { describe, expect, it } from 'vitest';

import {
  extractAddress,
  findMatchingPattern,
  isSenderAllowed,
  normalizeLocalPart,
  normalizeSenderPattern,
  patternMatches,
  validateAgentInput,
  validateLocalPart,
  validateSenderPattern,
} from './validation';
import { DEFAULT_MODEL } from './models';

describe('extractAddress', () => {
  it('pulls the address out of a display-name header', () => {
    expect(extractAddress('"Ada Lovelace" <Ada@Example.COM>')).toBe('ada@example.com');
  });

  it('accepts a bare address', () => {
    expect(extractAddress('  Ada@Example.com ')).toBe('ada@example.com');
  });

  it('takes only the first of several addresses', () => {
    expect(extractAddress('ada@example.com, mallory@evil.test')).toBe('ada@example.com');
  });

  it('returns an empty string for missing input', () => {
    expect(extractAddress(null)).toBe('');
    expect(extractAddress(undefined)).toBe('');
  });
});

describe('patternMatches', () => {
  it('matches an exact address regardless of case', () => {
    expect(patternMatches('ada@example.com', 'ADA@example.com')).toBe(true);
    expect(patternMatches('ada@example.com', 'bob@example.com')).toBe(false);
  });

  it('matches a domain wildcard', () => {
    expect(patternMatches('*@example.com', 'anyone@example.com')).toBe(true);
    expect(patternMatches('*@example.com', 'anyone@other.com')).toBe(false);
  });

  it('does not let a lookalike domain through a domain wildcard', () => {
    expect(patternMatches('*@example.com', 'mallory@notexample.com')).toBe(false);
    expect(patternMatches('*@example.com', 'mallory@example.com.evil.test')).toBe(false);
  });

  it('matches subdomains only with an explicit subdomain wildcard', () => {
    expect(patternMatches('*@*.example.com', 'ada@mail.example.com')).toBe(true);
    // The bare domain is not a subdomain of itself.
    expect(patternMatches('*@*.example.com', 'ada@example.com')).toBe(false);
    expect(patternMatches('*@example.com', 'ada@mail.example.com')).toBe(false);
  });

  it('treats a lone star as open to anyone', () => {
    expect(patternMatches('*', 'anyone@anywhere.test')).toBe(true);
  });

  it('rejects empty input on either side', () => {
    expect(patternMatches('', 'ada@example.com')).toBe(false);
    expect(patternMatches('*@example.com', '')).toBe(false);
  });
});

describe('findMatchingPattern', () => {
  const allowed = ['ada@example.com', '*@partner.test'];

  it('returns the pattern that admitted the sender', () => {
    expect(findMatchingPattern('bob@partner.test', allowed)).toBe('*@partner.test');
  });

  it('normalises the sender before matching', () => {
    expect(findMatchingPattern('"Ada" <ADA@example.com>', allowed)).toBe('ada@example.com');
  });

  it('returns null when nothing matches', () => {
    expect(findMatchingPattern('mallory@evil.test', allowed)).toBeNull();
    expect(isSenderAllowed('mallory@evil.test', allowed)).toBe(false);
  });

  it('denies everyone when the list is empty', () => {
    expect(isSenderAllowed('ada@example.com', [])).toBe(false);
  });
});

describe('normalizeSenderPattern', () => {
  it('expands a bare domain to a wildcard', () => {
    expect(normalizeSenderPattern('@example.com')).toBe('*@example.com');
  });

  it('lowercases and trims', () => {
    expect(normalizeSenderPattern('  Ada@Example.com  ')).toBe('ada@example.com');
  });
});

describe('validateSenderPattern', () => {
  it('accepts the supported forms', () => {
    for (const pattern of ['ada@example.com', '*@example.com', '*@*.example.com', '*']) {
      expect(validateSenderPattern(pattern)).toBeNull();
    }
  });

  it('rejects malformed entries', () => {
    for (const pattern of ['', 'not-an-email', 'ada@', '*@nodot', 'a b@example.com']) {
      expect(validateSenderPattern(pattern)).not.toBeNull();
    }
  });
});

describe('normalizeLocalPart', () => {
  it('turns a name into a usable local part', () => {
    expect(normalizeLocalPart('Support Triage')).toBe('support-triage');
    expect(normalizeLocalPart('  Weekly__Report  ')).toBe('weekly-report');
    expect(normalizeLocalPart('a.b.c')).toBe('a-b-c');
  });

  it('drops unsupported characters and edge hyphens', () => {
    expect(normalizeLocalPart('--Hello!! World--')).toBe('hello-world');
  });

  it('caps the length', () => {
    expect(normalizeLocalPart('x'.repeat(60))).toHaveLength(32);
  });
});

describe('validateLocalPart', () => {
  it('accepts ordinary local parts', () => {
    expect(validateLocalPart('support')).toBeNull();
    expect(validateLocalPart('a1')).toBeNull();
  });

  it('rejects reserved system addresses', () => {
    expect(validateLocalPart('postmaster')).toMatch(/reserved/);
    expect(validateLocalPart('noreply')).toMatch(/reserved/);
  });

  it('rejects empty and malformed values', () => {
    expect(validateLocalPart('')).not.toBeNull();
    expect(validateLocalPart('-leading')).not.toBeNull();
    expect(validateLocalPart('trailing-')).not.toBeNull();
  });
});

describe('validateAgentInput', () => {
  const base = {
    name: 'Support triage',
    emailLocal: 'Support Triage',
    systemPrompt: 'Answer support questions.',
    model: DEFAULT_MODEL,
    allowedSenders: ['ada@example.com'],
  };

  it('accepts and normalises a good input', () => {
    const result = validateAgentInput(base);
    expect(result.valid).toBe(true);
    expect(result.value.emailLocal).toBe('support-triage');
    expect(result.value.status).toBe('active');
  });

  it('requires at least one allowed sender', () => {
    const result = validateAgentInput({ ...base, allowedSenders: [] });
    expect(result.valid).toBe(false);
    expect(result.fields.allowedSenders).toMatch(/at least one/i);
  });

  it('rejects an unknown model', () => {
    const result = validateAgentInput({ ...base, model: 'gpt-imaginary' });
    expect(result.valid).toBe(false);
    expect(result.fields.model).toBeDefined();
  });

  it('requires a prompt and a name', () => {
    const result = validateAgentInput({ ...base, name: '  ', systemPrompt: '   ' });
    expect(result.valid).toBe(false);
    expect(result.fields.name).toBeDefined();
    expect(result.fields.systemPrompt).toBeDefined();
  });

  it('deduplicates and normalises allowed senders', () => {
    const result = validateAgentInput({
      ...base,
      allowedSenders: ['Ada@Example.com', 'ada@example.com', '@partner.test'],
    });
    expect(result.valid).toBe(true);
    expect(result.value.allowedSenders).toEqual(['ada@example.com', '*@partner.test']);
  });

  it('flags a malformed sender pattern', () => {
    const result = validateAgentInput({ ...base, allowedSenders: ['nope'] });
    expect(result.valid).toBe(false);
    expect(result.fields.allowedSenders).toBeDefined();
  });
});

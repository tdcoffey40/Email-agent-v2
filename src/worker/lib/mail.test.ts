import { describe, expect, it } from 'vitest';

import {
  buildReferences,
  htmlToText,
  isSenderForged,
  localPartOf,
  normalizeMessageId,
  parseAuthResults,
  parseReferences,
  replySubject,
  stripQuotedText,
  truncate,
} from './mail';

describe('localPartOf', () => {
  it('takes the local part and lowercases it', () => {
    expect(localPartOf('Support@Example.com')).toBe('support');
  });

  it('strips a plus tag so sub-addressing reaches the same agent', () => {
    expect(localPartOf('support+ticket-42@example.com')).toBe('support');
  });
});

describe('replySubject', () => {
  it('adds a Re: prefix', () => {
    expect(replySubject('Invoice question')).toBe('Re: Invoice question');
  });

  it('does not stack prefixes', () => {
    expect(replySubject('Re: Invoice question')).toBe('Re: Invoice question');
    expect(replySubject('RE: Invoice question')).toBe('RE: Invoice question');
  });

  it('handles a missing subject', () => {
    expect(replySubject('')).toBe('Re: (no subject)');
  });
});

describe('normalizeMessageId', () => {
  it('keeps an angle-bracketed id', () => {
    expect(normalizeMessageId('<abc@example.com>')).toBe('<abc@example.com>');
  });

  it('adds brackets to a bare id', () => {
    expect(normalizeMessageId('abc@example.com')).toBe('<abc@example.com>');
  });

  it('returns null for empty input', () => {
    expect(normalizeMessageId(null)).toBeNull();
    expect(normalizeMessageId('')).toBeNull();
  });
});

describe('parseReferences', () => {
  it('reads every id in the header', () => {
    expect(parseReferences('<a@x.com> <b@x.com>\n <c@x.com>')).toEqual([
      '<a@x.com>',
      '<b@x.com>',
      '<c@x.com>',
    ]);
  });

  it('returns an empty list when absent', () => {
    expect(parseReferences(undefined)).toEqual([]);
  });
});

describe('buildReferences', () => {
  it('appends the message being replied to', () => {
    expect(buildReferences(['<a@x.com>'], '<b@x.com>')).toEqual(['<a@x.com>', '<b@x.com>']);
  });

  it('does not duplicate an id already in the chain', () => {
    expect(buildReferences(['<a@x.com>', '<b@x.com>'], '<b@x.com>')).toEqual([
      '<a@x.com>',
      '<b@x.com>',
    ]);
  });

  it('keeps the head and the tail of a long chain', () => {
    const chain = Array.from({ length: 40 }, (_, i) => `<m${i}@x.com>`);
    const result = buildReferences(chain, '<new@x.com>');
    expect(result).toHaveLength(20);
    expect(result[0]).toBe('<m0@x.com>');
    expect(result.at(-1)).toBe('<new@x.com>');
  });
});

describe('stripQuotedText', () => {
  it('removes an "On ... wrote:" quote block', () => {
    const body = [
      'Yes, that works for me.',
      '',
      'On Mon, 3 Feb 2025 at 10:04, Ada <ada@example.com> wrote:',
      '> Are you free Tuesday?',
      '> Ada',
    ].join('\n');
    expect(stripQuotedText(body)).toBe('Yes, that works for me.');
  });

  it('removes an Outlook-style original message block', () => {
    const body = ['Sounds good.', '', '-----Original Message-----', 'From: Ada'].join('\n');
    expect(stripQuotedText(body)).toBe('Sounds good.');
  });

  it('cuts at a signature delimiter', () => {
    expect(stripQuotedText('Thanks!\n\n--\nAda Lovelace\nCTO')).toBe('Thanks!');
  });

  it('drops stray quoted lines', () => {
    expect(stripQuotedText('Agreed.\n> earlier text\nAnd one more thing.')).toBe(
      'Agreed.\nAnd one more thing.',
    );
  });

  it('keeps the original when stripping would empty it', () => {
    expect(stripQuotedText('> everything is quoted')).toBe('> everything is quoted');
  });

  it('leaves an ordinary message untouched', () => {
    expect(stripQuotedText('Hello there.\n\nSecond paragraph.')).toBe(
      'Hello there.\n\nSecond paragraph.',
    );
  });
});

describe('htmlToText', () => {
  it('converts blocks and breaks to newlines', () => {
    expect(htmlToText('<p>Hello</p><p>World</p>')).toBe('Hello\nWorld');
    expect(htmlToText('One<br>Two')).toBe('One\nTwo');
  });

  it('drops script and style content', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Visible</p>')).toBe('Visible');
    expect(htmlToText('<script>alert(1)</script><p>Visible</p>')).toBe('Visible');
  });

  it('decodes the common entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('marks where it cut', () => {
    const result = truncate('x'.repeat(50), 10);
    expect(result.startsWith('x'.repeat(10))).toBe(true);
    expect(result).toMatch(/truncated at 10 characters/);
  });
});

describe('parseAuthResults', () => {
  it('reads the individual verdicts', () => {
    const results = parseAuthResults('mx.cloudflare.com; spf=pass dkim=pass dmarc=fail');
    expect(results).toEqual({ spf: 'pass', dkim: 'pass', dmarc: 'fail' });
  });

  it('returns nulls when the header is absent', () => {
    expect(parseAuthResults(null)).toEqual({ spf: null, dkim: null, dmarc: null });
  });
});

describe('isSenderForged', () => {
  it('flags a DMARC or SPF failure', () => {
    expect(isSenderForged({ spf: 'pass', dkim: 'pass', dmarc: 'fail' })).toBe(true);
    expect(isSenderForged({ spf: 'fail', dkim: 'pass', dmarc: 'pass' })).toBe(true);
  });

  it('allows passes and inconclusive verdicts through', () => {
    expect(isSenderForged({ spf: 'pass', dkim: 'pass', dmarc: 'pass' })).toBe(false);
    expect(isSenderForged({ spf: null, dkim: null, dmarc: null })).toBe(false);
    expect(isSenderForged({ spf: 'neutral', dkim: 'none', dmarc: 'none' })).toBe(false);
  });
});

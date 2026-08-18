import { describe, expect, it } from 'vitest';

import { buildReplyMime } from './reply';

/** mimetext encodes non-ASCII-safe headers as RFC 2047 encoded words. */
function decodeHeaderWords(value: string): string {
  return value.replace(/=\?utf-8\?B\?([^?]+)\?=/gi, (_, encoded: string) =>
    Buffer.from(encoded, 'base64').toString('utf8'),
  );
}

const base = {
  from: 'support@agents.test',
  fromName: 'Support',
  to: 'ada@example.com',
  subject: 'Re: Invoice question',
  body: 'Here is the answer.',
  messageId: '<reply-1@agents.test>',
  inReplyTo: '<original-1@example.com>',
  references: ['<root@example.com>', '<original-1@example.com>'],
};

describe('buildReplyMime', () => {
  it('addresses the reply to the original sender', () => {
    const raw = decodeHeaderWords(buildReplyMime(base));
    expect(raw).toContain('To: <ada@example.com>');
    expect(raw).toContain('From: Support <support@agents.test>');
    expect(raw).toContain('Subject: Re: Invoice question');
  });

  it('carries the threading headers so clients group the conversation', () => {
    const raw = buildReplyMime(base);
    expect(raw).toContain('Message-ID: <reply-1@agents.test>');
    expect(raw).toContain('In-Reply-To: <original-1@example.com>');
    expect(raw).toContain('References: <root@example.com> <original-1@example.com>');
  });

  it('marks itself as an automated reply so other responders stay quiet', () => {
    expect(buildReplyMime(base)).toContain('Auto-Submitted: auto-replied');
  });

  it('omits threading headers on a brand new conversation', () => {
    const raw = buildReplyMime({ ...base, inReplyTo: null, references: [] });
    expect(raw).not.toContain('In-Reply-To:');
    expect(raw).not.toContain('References:');
  });

  it('includes the body', () => {
    expect(buildReplyMime(base)).toContain('Here is the answer.');
  });
});

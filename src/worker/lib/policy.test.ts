import { describe, expect, it } from 'vitest';

import type { Agent } from '../../shared/types';
import { automatedReason, senderDenialReason, type HeaderReader } from './policy';

function headers(values: Record<string, string> = {}): HeaderReader {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

function agentWith(allowedSenders: string[]): Agent {
  return {
    id: 'agt_1',
    userId: 'usr_1',
    name: 'Support',
    emailLocal: 'support',
    address: 'support@agents.test',
    description: '',
    systemPrompt: 'Help people.',
    model: '@cf/meta/llama-3.1-8b-instruct',
    status: 'active',
    skills: [],
    tools: [],
    mcpServers: [],
    allowedSenders,
    routingStatus: 'active',
    routingError: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('senderDenialReason', () => {
  const agent = agentWith(['ada@example.com', '*@partner.test']);

  it('admits an allowed sender', () => {
    expect(senderDenialReason(agent, headers(), 'ada@example.com', 'ada@example.com')).toBeNull();
  });

  it('admits a sender matched by a domain wildcard', () => {
    expect(senderDenialReason(agent, headers(), 'bob@partner.test', 'bob@partner.test')).toBeNull();
  });

  it('turns away a sender who is not on the list', () => {
    expect(senderDenialReason(agent, headers(), 'mallory@evil.test', 'mallory@evil.test')).toMatch(
      /not on the allowed senders list/,
    );
  });

  it('turns away a forged From header behind an allowed envelope', () => {
    const reason = senderDenialReason(agent, headers(), 'ada@example.com', 'mallory@evil.test');
    expect(reason).toMatch(/mallory@evil\.test is not on the allowed senders/);
  });

  it('turns away an allowed From header behind a disallowed envelope', () => {
    const reason = senderDenialReason(agent, headers(), 'mallory@evil.test', 'ada@example.com');
    expect(reason).toMatch(/mallory@evil\.test is not on the allowed senders/);
  });

  it('rejects a message that failed DMARC even from an allowed address', () => {
    const auth = headers({ 'authentication-results': 'mx.cloudflare.com; spf=pass dmarc=fail' });
    expect(senderDenialReason(agent, auth, 'ada@example.com', 'ada@example.com')).toMatch(
      /SPF\/DMARC/,
    );
  });

  it('rejects a message that failed SPF', () => {
    const auth = headers({ 'authentication-results': 'mx.cloudflare.com; spf=fail' });
    expect(senderDenialReason(agent, auth, 'ada@example.com', 'ada@example.com')).toMatch(
      /SPF\/DMARC/,
    );
  });

  it('rejects a message with no envelope sender', () => {
    expect(senderDenialReason(agent, headers(), '', '')).toMatch(/no usable sender/);
  });

  it('lets anyone through when the agent is open', () => {
    const open = agentWith(['*']);
    expect(senderDenialReason(open, headers(), 'anyone@anywhere.test', '')).toBeNull();
  });

  it('denies everyone when the list is empty', () => {
    const closed = agentWith([]);
    expect(senderDenialReason(closed, headers(), 'ada@example.com', '')).not.toBeNull();
  });
});

describe('automatedReason', () => {
  const address = 'support@agents.test';

  it('answers an ordinary message', () => {
    expect(automatedReason(headers(), 'ada@example.com', address)).toBeNull();
  });

  it('skips a bounce with an empty envelope sender', () => {
    expect(automatedReason(headers(), '', address)).toMatch(/Bounce/);
  });

  it('skips mail the agent sent to itself', () => {
    expect(automatedReason(headers(), address, address)).toMatch(/from the agent itself/);
  });

  it('skips an auto-submitted message', () => {
    const auto = headers({ 'auto-submitted': 'auto-replied' });
    expect(automatedReason(auto, 'ada@example.com', address)).toMatch(/Auto-submitted/);
  });

  it('answers a message that explicitly marks itself as not automated', () => {
    const auto = headers({ 'auto-submitted': 'no' });
    expect(automatedReason(auto, 'ada@example.com', address)).toBeNull();
  });

  it('skips mailing list traffic', () => {
    expect(automatedReason(headers({ 'list-id': '<x.lists.test>' }), 'a@b.test', address)).toMatch(
      /Mailing list/,
    );
    expect(
      automatedReason(headers({ 'list-unsubscribe': '<mailto:x>' }), 'a@b.test', address),
    ).toMatch(/Mailing list/);
  });

  it('skips bulk mail', () => {
    expect(automatedReason(headers({ precedence: 'bulk' }), 'a@b.test', address)).toMatch(
      /Precedence: bulk/,
    );
  });

  it('honours an auto-response suppression request', () => {
    const suppressed = headers({ 'x-auto-response-suppress': 'All' });
    expect(automatedReason(suppressed, 'a@b.test', address)).toMatch(/suppression/);
  });
});

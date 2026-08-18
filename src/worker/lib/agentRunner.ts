import type { Agent } from '../../shared/types';
import type { Env } from '../env';
import { type ChatMessage, generateReply } from './llm';

export interface RunContext {
  /** The address the agent receives on, and replies from. */
  address: string;
  /** The human on the other end. */
  sender: string;
  subject: string;
  /** Earlier turns on this thread, oldest first. */
  history: ChatMessage[];
  /** The message being answered, already stripped of quoted text. */
  incoming: string;
}

/**
 * Assemble the system prompt: the operator's instructions first, then the
 * enabled skills, then the rules that keep the output usable as an email body.
 */
export function buildSystemPrompt(agent: Agent, context: RunContext): string {
  const sections: string[] = [];

  sections.push(agent.systemPrompt.trim());

  const skills = agent.skills.filter((skill) => skill.enabled && skill.instructions.trim());
  if (skills.length > 0) {
    const rendered = skills
      .map((skill) => `### ${skill.name}\n${skill.instructions.trim()}`)
      .join('\n\n');
    sections.push(`## Skills\nApply these when they are relevant.\n\n${rendered}`);
  }

  const declaredTools = agent.tools.filter((tool) => tool.enabled);
  const declaredServers = agent.mcpServers.filter((server) => server.enabled);
  if (declaredTools.length > 0 || declaredServers.length > 0) {
    const names = [
      ...declaredTools.map((tool) => tool.name),
      ...declaredServers.map((server) => `${server.name} (MCP)`),
    ].join(', ');
    sections.push(
      `## Tools\nThese are configured but cannot be called yet: ${names}. If answering properly ` +
        `needs one of them, say plainly what you would need rather than inventing a result.`,
    );
  }

  sections.push(
    [
      '## Replying by email',
      `You are answering email at ${context.address}. The message is from ${context.sender}, ` +
        `subject "${context.subject || '(no subject)'}".`,
      'Your entire output becomes the body of the reply, so:',
      '- Write only the body. No "Subject:" line, no email headers, no quoted original.',
      '- Open and close the way a person writing an email would.',
      '- Plain text only. No markdown syntax, since mail clients show it literally.',
      '- Never claim to have taken an action you cannot actually take.',
      '- If the request is unclear, ask for exactly what you need.',
    ].join('\n'),
  );

  return sections.filter(Boolean).join('\n\n');
}

export async function runAgent(env: Env, agent: Agent, context: RunContext): Promise<string> {
  const messages: ChatMessage[] = [...context.history];

  // History already ends with this message when it was persisted first; only
  // append when it is genuinely absent so the model never sees it twice.
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || last.content !== context.incoming) {
    messages.push({ role: 'user', content: context.incoming });
  }

  return generateReply(env, {
    model: agent.model,
    system: buildSystemPrompt(agent, context),
    messages,
  });
}

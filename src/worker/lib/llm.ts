import { findModel } from '../../shared/models';
import type { Env } from '../env';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export class ModelError extends Error {}

const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_TIMEOUT_MS = 60_000;

/** Runs a model and returns the plain-text reply body. */
export async function generateReply(env: Env, options: GenerateOptions): Promise<string> {
  const descriptor = findModel(options.model);
  if (!descriptor) throw new ModelError(`Unknown model "${options.model}".`);

  const text =
    descriptor.provider === 'anthropic'
      ? await runAnthropic(env, options)
      : await runWorkersAi(env, options);

  const trimmed = text.trim();
  if (!trimmed) throw new ModelError('The model returned an empty reply.');
  return trimmed;
}

async function runWorkersAi(env: Env, options: GenerateOptions): Promise<string> {
  if (!env.AI) throw new ModelError('The Workers AI binding is not configured.');

  // The Ai binding types model names as a closed union; agents choose theirs
  // at runtime, so the call is made through a structural signature.
  const ai = env.AI as unknown as {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };

  let raw: unknown;
  try {
    raw = await ai.run(options.model, {
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'system', content: options.system }, ...options.messages],
    });
  } catch (error) {
    throw new ModelError(`Workers AI request failed: ${errorText(error)}`);
  }

  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const response = (raw as { response?: unknown }).response;
    if (typeof response === 'string') return response;
  }
  throw new ModelError('Workers AI returned a response in an unexpected shape.');
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

async function runAnthropic(env: Env, options: GenerateOptions): Promise<string> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ModelError(
      'This agent uses a Claude model, but ANTHROPIC_API_KEY is not set on the Worker.',
    );
  }

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: options.system,
        messages: options.messages,
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ModelError(`Could not reach the Anthropic API: ${errorText(error)}`);
  }

  const body = (await response.json().catch(() => null)) as AnthropicResponse | null;
  if (!response.ok) {
    throw new ModelError(body?.error?.message ?? `Anthropic API returned HTTP ${response.status}.`);
  }

  const text = (body?.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new ModelError('Anthropic returned no text content.');
  return text;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

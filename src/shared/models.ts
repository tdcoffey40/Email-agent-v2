import type { ModelOption } from './types';

/**
 * Models an agent can run on. Workers AI models need no extra credentials,
 * so the stack works on Cloudflare alone; Anthropic models activate once
 * ANTHROPIC_API_KEY is set.
 */
export const MODELS: ModelOption[] = [
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B (fast)',
    provider: 'workers-ai',
    description: 'Balanced default. Runs on Workers AI, no API key needed.',
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B',
    provider: 'workers-ai',
    description: 'Cheapest and quickest. Good for short, routine replies.',
  },
  {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    label: 'Qwen 2.5 Coder 32B',
    provider: 'workers-ai',
    description: 'Stronger at code and structured output.',
  },
  {
    id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    label: 'Mistral Small 3.1 24B',
    provider: 'workers-ai',
    description: 'Solid general purpose model with a long context window.',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    description: 'Highest quality prose and reasoning. Requires ANTHROPIC_API_KEY.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fast and inexpensive Claude. Requires ANTHROPIC_API_KEY.',
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

export function findModel(id: string): ModelOption | undefined {
  return MODELS.find((m) => m.id === id);
}

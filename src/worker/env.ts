export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;

  // vars
  APP_NAME: string;
  EMAIL_DOMAIN: string;
  DEFAULT_MODEL: string;

  // secrets
  SESSION_SECRET?: string;
  CF_API_TOKEN?: string;
  CF_ZONE_ID?: string;
  ANTHROPIC_API_KEY?: string;

  /**
   * Worker name the Email Routing rules should forward to. Defaults to the
   * name in wrangler.jsonc; override only if you renamed the deployment.
   */
  WORKER_NAME?: string;
}

export const DEFAULT_WORKER_NAME = 'email-agent-v2';

export function workerName(env: Env): string {
  return env.WORKER_NAME || DEFAULT_WORKER_NAME;
}

export function agentAddress(env: Env, emailLocal: string): string {
  return `${emailLocal}@${env.EMAIL_DOMAIN}`;
}

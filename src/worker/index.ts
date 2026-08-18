import api from './api/index';
import { handleEmail } from './email';
import type { Env } from './env';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx);
    }
    // Everything else is the React app, served from the assets binding with
    // SPA fallback (configured in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    try {
      await handleEmail(message, env);
    } catch (error) {
      // A thrown error here would retry delivery; reject once instead.
      console.error('unhandled email error', { error: String(error) });
      message.setReject('The agent service failed to process this message.');
    }
  },
} satisfies ExportedHandler<Env>;

# Email Agents

Give an AI agent its own email address. Mail it, and it replies on the same
thread — but only if you are on its allowed senders list.

Everything runs on Cloudflare: Workers for the API and the inbound mail
handler, D1 for storage, Workers AI for the model, Email Routing for delivery,
and Workers Assets for the React front end. One Worker, one deploy.

## What it does

- **Register and sign in.** Password auth with PBKDF2-hashed credentials and
  HttpOnly session cookies.
- **Create agents.** Each gets a title, a prompt, a model, a unique address
  (`name@your-domain`), and a list of senders it will answer. Skills, tools and
  MCP servers are editable now; skills already shape the prompt, tools and MCP
  are recorded for a later release.
- **Save, and routing follows.** Saving provisions a Cloudflare Email Routing
  rule for the address pointing at this Worker.
- **Mail arrives and gets answered.** The Worker resolves the agent from the
  recipient, checks the sender against the allowlist, runs the model with the
  thread's history, and replies from the agent's address with the RFC 5322
  headers that keep it on the original thread.
- **Watch what happened.** Every message — answered, rejected or failed — is
  visible per agent and across the account.

## How a message flows

```
inbound mail
  → Email Routing rule for name@your-domain
  → Worker email() handler
      resolve agent by recipient local part   → unknown address? reject
      agent paused?                           → reject
      SPF / DMARC verdict                     → forged? reject
      envelope sender on allowlist?           → no? reject + log
      From: header on allowlist?              → no? reject + log
      auto-submitted / mailing list / bounce? → drop, never auto-reply
      find thread via In-Reply-To/References  → else start one
      run model with thread history
      reply() with In-Reply-To + References   → lands on the same thread
```

### Who counts as an allowed sender

Both the SMTP envelope sender **and** the `From:` header must be on the list.
Checking only the envelope would let a permitted relay present any identity in
the header; checking only the header trusts a field anyone can forge. A hard
SPF or DMARC failure is rejected outright, because an allowlist is only as
good as the sender's identity.

Patterns:

| Pattern | Matches |
| --- | --- |
| `ada@example.com` | that address only |
| `*@example.com` | anyone at `example.com` (not subdomains) |
| `*@*.example.com` | anyone at any subdomain of `example.com` |
| `*` | anyone at all — the editor warns about this |

`@example.com` is accepted as shorthand for `*@example.com`.

## Setup

Requires Node 18+, a Cloudflare account, and a domain on Cloudflare with
[Email Routing](https://developers.cloudflare.com/email-routing/) enabled.

```bash
npm install
npx wrangler d1 create email_agent_db     # copy the id into wrangler.jsonc
npm run db:migrate:local
```

Set `EMAIL_DOMAIN` in `wrangler.jsonc` to the domain your agents receive on.

Create `.dev.vars` from the example and fill in `SESSION_SECRET`:

```bash
cp .dev.vars.example .dev.vars
openssl rand -hex 32     # paste as SESSION_SECRET
```

Run it:

```bash
npm run dev          # Vite front end on :5173, proxying /api
npm run dev:worker   # Worker + D1 + email handler on :8787
```

### Deploy

```bash
npx wrangler secret put SESSION_SECRET      # required
npx wrangler secret put CF_API_TOKEN        # optional, see below
npx wrangler secret put CF_ZONE_ID
npx wrangler secret put ANTHROPIC_API_KEY   # optional, enables Claude models
npm run db:migrate:remote
npm run deploy
```

Then point mail at the Worker, either way round:

- **Automatic per-address rules.** Set `CF_API_TOKEN` (needs *Email Routing
  Rules: Edit* on the zone) and `CF_ZONE_ID`. Saving an agent creates or
  updates its routing rule, and the UI shows the result.
- **Catch-all.** In the dashboard, set the zone's Email Routing catch-all
  action to *Send to a Worker* → `email-agent-v2`. Every agent address then
  arrives without any per-address rules; the UI reports `Catch-all routing`.
  Unknown addresses are rejected by the handler.

Either way works — the Worker resolves the agent from the recipient address
regardless of how the mail reached it.

## Models

Workers AI models need no extra credentials, so the stack runs on Cloudflare
alone. Setting `ANTHROPIC_API_KEY` adds the Claude models to the picker. The
list lives in `src/shared/models.ts`.

## Layout

```
src/
  shared/     types, model catalog, validation and sender matching (used by both sides)
  worker/
    index.ts  fetch + email entry points
    api/      Hono routes: auth, agents, threads, activity
    email.ts  the inbound pipeline
    lib/      auth, crypto, D1 access, policy, routing, model calls, MIME
  client/
    components/ui/  the design system primitives
    pages/          sign in, agents, agent editor, activity
migrations/   D1 schema
```

## Tests

```bash
npm test        # 81 unit tests
npm run typecheck
```

Unit tests cover the parts where a mistake is a security bug or a broken
thread: sender matching, the allowlist and auto-reply policy, quoted-text
stripping, and the threading headers on the reply.

The full path was also exercised end to end against a local Worker and D1 —
register, create agent, allowed sender, disallowed sender, forged `From`
header behind an allowed envelope, unknown address, paused agent, and a
follow-up joining its existing thread.

## Notes and limits

- **The model call and the reply send need a deployed Worker.** Workers AI
  refuses to run against a local binding, so replies cannot be generated with
  `wrangler dev --local`. Everything up to the model call works locally.
- **Tools and MCP servers are not executed yet.** They are stored per agent and
  named in the prompt so the model says what it would need rather than
  inventing a result.
- **Rejected messages are logged**, which is a write triggered by an untrusted
  sender. It is capped at 50 per agent per hour so it cannot be used to pad the
  table.
- **Attachments are parsed but not passed to the model.**

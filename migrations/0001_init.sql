-- Email Agents: initial schema.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_norm    TEXT NOT NULL UNIQUE, -- lowercased, used for lookup
  name          TEXT,
  password_hash TEXT NOT NULL,        -- pbkdf2$<iterations>$<salt_b64>$<hash_b64>
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,        -- sha-256 of the cookie token
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE agents (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  -- Local part of the agent's address. Unique across the whole install
  -- because every agent shares one email domain.
  email_local    TEXT NOT NULL UNIQUE,
  description    TEXT NOT NULL DEFAULT '',
  system_prompt  TEXT NOT NULL,
  model          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active', -- active | paused
  -- Reserved for the capability work: JSON arrays kept opaque to the DB.
  skills         TEXT NOT NULL DEFAULT '[]',
  tools          TEXT NOT NULL DEFAULT '[]',
  mcp_servers    TEXT NOT NULL DEFAULT '[]',
  -- Cloudflare Email Routing rule provisioned for this address.
  routing_rule_id TEXT,
  routing_status  TEXT NOT NULL DEFAULT 'pending', -- pending | active | error | disabled
  routing_error   TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_agents_user ON agents(user_id);

CREATE TABLE allowed_senders (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- Exact address (a@b.com), domain wildcard (*@b.com), or catch-all (*).
  pattern    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (agent_id, pattern)
);
CREATE INDEX idx_allowed_senders_agent ON allowed_senders(agent_id);

CREATE TABLE threads (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- The human on the other end of the conversation.
  participant      TEXT NOT NULL,
  subject          TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);
CREATE INDEX idx_threads_agent ON threads(agent_id, last_activity_at DESC);

CREATE TABLE messages (
  id             TEXT PRIMARY KEY,
  thread_id      TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  direction      TEXT NOT NULL,  -- inbound | outbound
  status         TEXT NOT NULL,  -- received | rejected | replied | failed
  from_addr      TEXT NOT NULL,
  to_addr        TEXT NOT NULL,
  subject        TEXT NOT NULL DEFAULT '',
  -- RFC 5322 identifiers, the basis of in-thread replies.
  rfc_message_id TEXT,
  in_reply_to    TEXT,
  refs           TEXT,           -- space separated References header
  body           TEXT NOT NULL DEFAULT '',
  error          TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_agent ON messages(agent_id, created_at DESC);
-- Inbound Message-IDs are how a reply finds the thread it belongs to.
CREATE INDEX idx_messages_rfc_id ON messages(rfc_message_id);

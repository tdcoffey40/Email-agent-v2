#!/usr/bin/env bash
#
# One-shot provisioning + deploy for Email Agents.
#
#   ./scripts/setup-cloudflare.sh your-domain.com
#
# Safe to re-run: it reuses an existing D1 database and only fills in the
# pieces that are still missing.

set -euo pipefail

DOMAIN="${1:-}"
DB_NAME="email_agent_db"
CONFIG="wrangler.jsonc"

if [[ -z "$DOMAIN" ]]; then
  echo "usage: $0 <email-domain>" >&2
  echo "  the domain must be on Cloudflare with Email Routing enabled" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Checking authentication"
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Not authenticated. Run 'npx wrangler login', or export CLOUDFLARE_API_TOKEN." >&2
  exit 1
fi
npx wrangler whoami | tail -n 3

step "Ensuring the D1 database exists"
if ! npx wrangler d1 info "$DB_NAME" >/dev/null 2>&1; then
  echo "Creating $DB_NAME..."
  npx wrangler d1 create "$DB_NAME" >/dev/null
else
  echo "$DB_NAME already exists."
fi

DB_ID="$(npx wrangler d1 list --json | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    const list = JSON.parse(raw);
    const match = list.find((db) => db.name === process.argv[1]);
    if (!match) { console.error("database not found: " + process.argv[1]); process.exit(1); }
    // Wrangler has spelled this field both ways across versions.
    const id = match.uuid || match.database_id || match.id;
    if (!id) { console.error("no id on: " + JSON.stringify(match)); process.exit(1); }
    process.stdout.write(id);
  });
' "$DB_NAME")"
echo "database_id: $DB_ID"

step "Writing the database id and email domain into $CONFIG"
node -e '
  const fs = require("fs");
  const [file, dbId, domain] = process.argv.slice(1);
  let text = fs.readFileSync(file, "utf8");
  text = text.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${dbId}"`);
  text = text.replace(/"EMAIL_DOMAIN":\s*"[^"]*"/, `"EMAIL_DOMAIN": "${domain}"`);
  fs.writeFileSync(file, text);
' "$CONFIG" "$DB_ID" "$DOMAIN"
grep -E '"database_id"|"EMAIL_DOMAIN"' "$CONFIG"

step "Applying migrations to the remote database"
npx wrangler d1 migrations apply "$DB_NAME" --remote

step "Building the front end"
npm run build

# The Worker has to exist before a secret can be attached to it, so the first
# deploy comes first. Secrets bind at runtime, so no redeploy is needed after.
step "Deploying"
npx wrangler deploy

step "Setting SESSION_SECRET"
# Only set it if the Worker does not already have one: re-running this script
# must not invalidate everyone's live sessions.
if npx wrangler secret list 2>/dev/null | grep -q SESSION_SECRET; then
  echo "SESSION_SECRET is already set; leaving it alone."
else
  echo "Generating a new SESSION_SECRET..."
  node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' \
    | npx wrangler secret put SESSION_SECRET
fi

cat <<DONE

Deployed.

Two things are left, and they need the Cloudflare dashboard:

  1. Route mail to the Worker. In $DOMAIN → Email → Email Routing, either
     set the catch-all action to "Send to a Worker" → email-agent-v2, or
     give the Worker per-address rules by setting these secrets:

       npx wrangler secret put CF_API_TOKEN   # needs Email Routing Rules: Edit
       npx wrangler secret put CF_ZONE_ID

  2. Optional: enable Claude models.

       npx wrangler secret put ANTHROPIC_API_KEY

Then open the deployed URL, register, and create your first agent.
DONE

# Integrations — LifeFlow AI

External services connected to LifeFlow and how to configure them.

## Overview

| Integration | Direction | Purpose |
|-------------|-----------|---------|
| Google Calendar | Two-way (push primary) | Sync tasks/reminders as events; pull upcoming events |
| Notion | Import (+ export helper) | Import pages into knowledge vault |
| Gmail | Read-only ingest | Bills → reminders, action mail → tasks, newsletters → vault |
| MCP | Outbound tool server | Cursor / Claude call LifeFlow tools via `/api/mcp` |
| Telegram | Inbound webhook | Mobile bot interface |
| Webhooks | Outbound | Zapier, Make, n8n automation |
| Chrome extension | Inbound clip | Save URLs from browser |
| Google/GitHub OAuth | Auth only | Sign-in via Better Auth |

Code lives in `src/lib/integrations/` and `src/app/api/integrations/`.

---

## Google Calendar

### What it does

- **Push**: Tasks with `dueAt` and all active reminders → Google Calendar primary calendar
- **Pull**: Upcoming calendar events → LifeFlow tasks (deduped by title + due)
- **Auto-sync**: On task/reminder create, update via API and Telegram
- **Cleanup**: Delete calendar event when task/reminder deleted or marked complete

### Setup

1. Enable **Google Calendar API** in Google Cloud Console
2. Create OAuth 2.0 credentials (Web application)
3. Add redirect URI: `{BETTER_AUTH_URL}/api/integrations/google-calendar/callback`
4. Set env vars (can reuse sign-in credentials):

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
# or GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET
```

5. User connects at **Dashboard → Integrations → Connect Google Calendar**

### Important notes

- Calendar OAuth is **separate from sign-in OAuth** — users must connect from Integrations page even if they log in with Google
- Scopes: `calendar.events`, `openid`, `email`
- Tokens stored in `Integration` table; refresh handled in `google-calendar.ts`
- Event mapping in `CalendarSyncMap` table

### Key files

- `src/lib/integrations/google-calendar.ts` — OAuth, token refresh, CRUD events
- `src/lib/integrations/calendar-sync.ts` — Sync orchestration
- `src/lib/integrations/store.ts` — Token persistence

---

## Notion

### What it does

- OAuth connect to user's Notion workspace
- **Import**: Search recent pages → create `KnowledgeItem` with content, embeddings, context graph
- Skips pages already imported (by `metadata.notionPageId`)
- **Export helper**: `exportKnowledgeToNotion()` — creates page in workspace (optional parent page in metadata)

### Setup

1. Create integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) → **OAuth** tab
2. Redirect URI: `{BETTER_AUTH_URL}/api/integrations/notion/callback`
3. Set env:

```env
NOTION_CLIENT_ID=""
NOTION_CLIENT_SECRET=""
```

4. User connects at **Dashboard → Integrations → Connect Notion**
5. On connect, auto-imports ~15 pages; use **Import pages** for more

### Key files

- `src/lib/integrations/notion-sync.ts`
- `src/app/api/integrations/notion/*`

---

## Gmail (read-only)

### What it does

- Scans the last 7 days (primary inbox, no promotions/social), classifies each email with the LLM (heuristic fallback):
  - **bill** → `Reminder` + `RecurringBill` + vault document with amount/due date
  - **action** → `Task` (due in ~2 days, Calendar-synced)
  - **knowledge** → `KnowledgeItem` (newsletter/article) with embeddings + graph links
  - **skip** → archived marker so the email is never reprocessed
- Dedupes on `KnowledgeItem.metadata.gmailId`.

### Setup

1. Enable **Gmail API** in Google Cloud Console
2. Add redirect URI: `{BETTER_AUTH_URL}/api/integrations/gmail/callback`
3. Scope requested: `gmail.readonly`. Reuses `GOOGLE_CLIENT_ID/SECRET` unless `GMAIL_CLIENT_ID/SECRET` set.
4. Connect at **Dashboard → Integrations → Connect Gmail**, then **Scan inbox**.

Key file: `src/lib/integrations/gmail.ts`

---

## MCP server

`/api/mcp` exposes the shared tool registry over Model Context Protocol (Streamable HTTP, JSON responses). Add to Cursor `.cursor/mcp.json` or Claude Desktop with a `Bearer lf_live_...` header from `/dashboard/developer`. See [API.md](./API.md#mcp-server).

---

## Chrome side-panel copilot

Source: `chrome-extension/`. Users download `/lifeflow-copilot.zip` from **Dashboard → Developer** (or load `chrome-extension/` unpacked). Click the toolbar icon or press Alt+Shift+L. Set the app URL and an `lf_live_` API key once, then Test connection.

Features: **Ask my brain** (`POST /api/v1/copilot`), **Save page**, **Save selection**, **Task from page**, **Notes → tasks** (selected text → meeting intelligence). The same actions are on the right-click menu. Saving a URL twice returns the existing vault item. Page text captured in the browser is sent with the save so client-rendered pages still index.

---

## Telegram

### What it does

Primary mobile interface: save links, search, tasks, expenses, habits, voice, documents.

### Setup

1. Create bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
3. Register webhook pointing to `{BETTER_AUTH_URL}/api/telegram`
4. User links account: Settings → Telegram → copy code → `/link <code>`

### Architecture

```
POST /api/telegram
  ├── Slash commands (route.ts)
  └── Natural language → agent-router.ts → search-pipeline / knowledge-engine / etc.
```

### Key files

- `src/app/api/telegram/route.ts`
- `src/lib/agent-router.ts`
- `src/lib/telegram.ts` — send message/voice helpers

---

## Outbound webhooks

Users register URLs at `/dashboard/automation`. On app events, LifeFlow POSTs JSON payload with optional HMAC secret.

### Event flow

```
lib action → publishAppEvent(userId, type, payload)
          → prisma AppEvent create
          → webhooks.ts dispatch to matching URLs
```

### Key files

- `src/lib/webhooks.ts`
- `src/lib/events.ts`
- `src/app/api/webhooks/route.ts`

---

## Chrome extension

Location: `chrome-extension/`. Packaged download: `public/lifeflow-copilot.zip`, served at `/lifeflow-copilot.zip`.

Rebuild after changing the extension:

```bash
node scripts/generate-extension-icons.mjs
node scripts/pack-extension.mjs
```

Load unpacked via Chrome → Extensions → Developer mode. The panel authenticates with a Bearer API key from Dashboard → Developer, not a browser session cookie.

---

## Better Auth (sign-in)

Not an "integration" in the Integrations UI, but required for all web features.

- Config: `src/lib/auth.ts`
- Client: `src/lib/auth-client.ts`
- Routes: `/api/auth/[...all]`
- Supports email/password, Google, GitHub

---

## OAuth state security

All integration OAuth flows use HMAC-signed state in `oauth-state.ts`:

- 15-minute expiry
- Secret: `BETTER_AUTH_SECRET` or `INTEGRATION_OAUTH_SECRET`
- Prevents CSRF on callbacks

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Calendar connect fails | Check redirect URI exact match; Calendar API enabled |
| Notion import empty | Grant page access to integration in Notion |
| Telegram not responding | Verify webhook URL HTTPS; check bot token |
| Sync not happening | Confirm integration `syncEnabled` and connected in `/api/integrations` |
| Token expired | Google auto-refreshes; reconnect if refresh token missing |

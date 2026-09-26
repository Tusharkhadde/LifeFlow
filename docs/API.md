# API reference — LifeFlow AI

Authenticated routes accept **either** a Better Auth session cookie **or** `Authorization: Bearer lf_live_...` API key. Auth helper: `getAuthenticatedUserId(request.headers)`.

Base URL: `{BETTER_AUTH_URL}` (e.g. `http://localhost:3000`).

## Auth

| Method | Path | Description |
|--------|------|-------------|
| * | `/api/auth/[...all]` | Better Auth handlers (sign-in, sign-up, OAuth) |

## Knowledge

| Method | Path | Body / params | Description |
|--------|------|---------------|-------------|
| GET | `/api/knowledge` | — | List vault items |
| POST | `/api/knowledge` | `{ title, content, ... }` | Create item |
| PATCH | `/api/knowledge` | `{ id, ... }` | Update item |
| DELETE | `/api/knowledge?id=` | — | Delete item |
| POST | `/api/knowledge/ask` | `{ query }` | Smart search (web) |

## Tasks & reminders

| Method | Path | Body | Side effects |
|--------|------|------|--------------|
| GET/POST/PATCH/DELETE | `/api/tasks` | CRUD fields | Calendar sync on create/update |
| GET/POST/PATCH/DELETE | `/api/reminders` | CRUD fields | Calendar sync on create/update |

## Finance

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/expenses` | Expense CRUD |
| GET/POST/PATCH/DELETE | `/api/budgets` | Category budgets |
| GET/POST/PATCH/DELETE | `/api/goals` | Savings goals |
| GET/POST | `/api/bills` | Recurring bills |

## Habits

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PATCH | `/api/habits` | Habits + log entries |

## Documents

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/documents` | Upload + OCR pipeline |

## Search & insights

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search-history` | Past searches |
| GET | `/api/insights` | Dashboard insights |
| GET | `/api/graph` | Knowledge graph data |
| GET | `/api/report/monthly` | Monthly report text |
| GET/POST | `/api/weekly-review` | Weekly review (cron on Sunday) |

## Settings & usage

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/settings` | Persona, voice briefing, `monthlyAiBudgetUsd`, `preferredFastModel`, triage, retention |
| GET | `/api/usage` | 30-day feature limits plus monthly AI cost, cache hits, and per-operation breakdown |
| GET | `/api/export` | Data export |

## Collections & workspace

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/DELETE | `/api/collections` | List, create, auto-organize, delete |
| GET/POST | `/api/workspaces` | Create/join/list workspaces |

## Integrations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations` | Connection status for all providers |
| GET | `/api/integrations/google-calendar/auth` | Returns `{ url }` for OAuth |
| GET | `/api/integrations/google-calendar/callback` | OAuth callback (redirect) |
| POST | `/api/integrations/google-calendar` | `{ action: "push" \| "pull" }` sync |
| DELETE | `/api/integrations/google-calendar` | Disconnect |
| GET | `/api/integrations/notion/auth` | Returns `{ url }` for OAuth |
| GET | `/api/integrations/notion/callback` | OAuth callback (redirect) |
| POST | `/api/integrations/notion` | `{ limit }` import pages |
| DELETE | `/api/integrations/notion` | Disconnect |

## Telegram

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/telegram` | Webhook secret | Main bot webhook |
| GET/POST | `/api/telegram/link` | Session | Generate link code |
| POST | `/api/telegram/setup` | Admin | Set webhook URL |
| GET | `/api/telegram/notify` | `CRON_SECRET` | Daily notify cron |

## Automation

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/DELETE | `/api/webhooks` | Outbound webhook CRUD |
| GET | `/api/events/stream` | SSE app events |
| POST | `/api/sms-parse` | Parse bank SMS text |

## Command center & SaaS

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/overview` | Today command center payload |
| GET/POST | `/api/morning` | Morning OS: get today's run or execute it |
| POST | `/api/assistant` | Tool-using assistant; SSE stream of `status`/`tool_start`/`tool_result`/`token`/`sources`/`done` |
| GET/POST | `/api/meetings` | List meetings / process `{ transcript }` or `{ audioBase64, fileName }` |
| GET/POST/DELETE | `/api/integrations/gmail` + `/auth`, `/callback` | Gmail read-only connect, scan, disconnect |

## MCP server

`POST /api/mcp` — JSON-RPC 2.0 (Streamable HTTP, stateless). `initialize`, `tools/list`, `tools/call`, `ping`. Requires `Authorization: Bearer lf_live_...` for `tools/call`.

```json
{ "mcpServers": { "lifeflow": { "url": "https://your-app/api/mcp", "headers": { "Authorization": "Bearer lf_live_..." } } } }
```

Tools: `search_vault`, `save_knowledge`, `create_task`, `list_tasks`, `complete_task`, `create_reminder`, `log_expense`, `expense_summary`, `log_habit`, `today_overview`, `run_morning`, `process_meeting`, `remember_fact`.
| GET | `/api/activity` | App event feed |
| GET/POST/DELETE | `/api/memory` | Personal memory CRUD |
| GET/POST/DELETE | `/api/keys` | API key create/list/revoke |
| GET/POST/DELETE | `/api/share` | Authenticated share-link CRUD |
| GET | `/api/share/public?token=` | Public share payload |
| GET/PATCH | `/api/notifications` | Inbox + mark read |
| POST | `/api/import` | Restore JSON export |
| GET | `/api/health` | Status (public) |

## Public API v1

Bearer API key required. CORS enabled.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/me` | Confirm an API key (`{ ok: true }`). Used by the Chrome extension |
| GET/POST | `/api/v1/knowledge` | List or save vault items. POST accepts `{ input, text?, title?, type?, sourceUrl? }` and returns `{ item, alreadySaved }` |
| GET/POST | `/api/v1/tasks` | List or create tasks |
| GET/POST | `/api/v1/expenses` | List or log expenses |
| POST | `/api/v1/search` | `{ query }` smart search |
| POST | `/api/v1/morning` | Run Morning OS agent |
| GET/POST | `/api/v1/meetings` | List / process meeting transcript |
| POST | `/api/v1/copilot` | `{ url, title, text, question }` → grounded answer + related vault items (used by Chrome side panel) |

## AI

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai` | General AI endpoint |

## Response conventions

- Success: `{ ...data }` or `{ success: true }`
- Error: `{ error: "message" }` with 4xx/5xx status
- List endpoints: plural key (`{ tasks: [] }`, `{ integrations: [] }`)

## Event types (webhooks)

Published via `publishAppEvent()` — common types:

- `knowledge_saved`, `task_created`, `task_updated`
- `reminder_created`, `reminder_updated`
- `expense_created`, `search_completed`

Configure listeners in `/dashboard/automation`.

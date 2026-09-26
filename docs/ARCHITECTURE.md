# Architecture — LifeFlow AI

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client surfaces                          │
│  Web (Next.js)  │  Telegram  │  Chrome ext  │  Webhooks (out)   │
└────────┬────────┴─────┬──────┴──────┬───────┴───────────────────┘
         │              │             │
         v              v             v
┌─────────────────────────────────────────────────────────────────┐
│              Next.js App Router — /api/* routes                  │
│  auth-helpers │ thin handlers │ publishAppEvent                  │
└────────┬────────────────────────────────────────────────────────┘
         │
         v
┌─────────────────────────────────────────────────────────────────┐
│                     src/lib/ (business logic)                      │
│  agent-router │ search-pipeline │ knowledge-engine │ integrations│
└────────┬────────────────────────────────────────────────────────┘
         │
    ┌────┴────┬──────────┬────────────┐
    v         v          v            v
 PostgreSQL  OpenAI-    Exa.ai     Google/Notion
 (Prisma)    compatible  REST       OAuth APIs
             API
```

## Request paths

### Web API (authenticated)

```
Browser → Better Auth session cookie
       → getAuthenticatedUserId(headers)
       → prisma.* / lib.*
       → JSON response
```

Auth is configured in `src/lib/auth.ts` (Better Auth + Prisma adapter). Client uses `src/lib/auth-client.ts`.

### Telegram webhook

```
Telegram → POST /api/telegram
        → Verify webhook secret (if set)
        → Slash commands handled in route.ts
        → Other messages → agentRouter.route()
        → sendTelegramMessage()
```

Linking flow: user generates code in Settings → `/link <code>` → `TelegramLink` row connects `telegramUserId` to `userId`.

### Knowledge save (URL)

```
Input URL
  → web-scraper.ts (fetch + clean HTML)
  → knowledge-engine.ts (LLM → title, summary, aiMemory, tags)
  → prisma.knowledgeItem.create
  → hybrid-search.ts (embedding index)
  → context-graph.ts (ingestContext)
  → events.ts (publishAppEvent + webhooks)
```

### Smart search

```
Query
  → rate-limit.ts
  → hybrid-search.ts (vault embeddings + keywords)
  → personal-memory.ts + context-graph.ts (context strings)
  → exa-search.ts (if EXA_API_KEY set)
  → OpenAI-compatible chat/completions (synthesis)
  → search-history.ts (persist)
  → optional: extract memories + graph edges from answer
```

Implemented in `src/lib/search-pipeline.ts` — used by Telegram, `/api/knowledge/ask`, and agent-router.

### Task/reminder + calendar sync

```
createTask / createReminder (productivity-actions or API)
  → prisma create
  → syncLifeFlowItemToIntegrations(userId, type, id)
  → calendar-sync.ts → Google Calendar API (if connected)
```

On delete or `completed: true` → `removeGoogleCalendarSync()`.

## Core libraries

| File | Responsibility |
|------|----------------|
| `agent-router.ts` | Telegram NL routing: URLs, expenses, habits, search |
| `search-pipeline.ts` | Unified smart search pipeline |
| `knowledge-engine.ts` | Scrape + synthesize on ingest |
| `hybrid-search.ts` | Embeddings + keyword scoring |
| `embeddings.ts` | OpenAI embedding API calls |
| `exa-search.ts` | Exa REST client |
| `context-graph.ts` | Entity/relation extraction and storage |
| `personal-memory.ts` | Key-value user facts |
| `productivity-actions.ts` | Tasks, reminders, briefing |
| `events.ts` | AppEvent log + webhook dispatch |
| `ai-provider.ts` | Resolves LLM base URL, model, API key |
| `agent-langgraph.ts` | LangGraph workflow (alternative path, not primary Telegram router) |

## Data layers

### Knowledge representation

- **KnowledgeItem** — primary vault record; `embedding` JSON for vector search
- **PersonalMemory** — structured facts about the user
- **ContextEntity / ContextRelation** — lightweight knowledge graph
- **SearchHistory** — past queries and answers

### Productivity & finance

- **Task**, **Reminder** — with optional **CalendarSyncMap** to Google events
- **Expense**, **Budget**, **SavingsGoal**, **RecurringBill**
- **Habit**, **HabitLog**

### Platform

- **User**, **Session**, **Account** — Better Auth
- **TelegramLink**, **LinkCode**, **Conversation**, **ConversationMessage**
- **Integration** — OAuth tokens (google_calendar, notion)
- **Webhook**, **AppEvent**, **UsageLog**, **UserSettings**
- **Workspace**, **WorkspaceMember**

See [DATABASE.md](./DATABASE.md) for full schema.

## Real-time & background

| Mechanism | Purpose |
|-----------|---------|
| `GET /api/events/stream` | SSE for live dashboard updates |
| Vercel cron → `/api/telegram/notify` | Daily reminders/briefing push |
| Vercel cron → `/api/weekly-review` | Weekly review generation |
| `publishAppEvent` | Triggers registered webhooks |
| `POST /api/jobs/dispatch` | Claims PostgreSQL jobs with `FOR UPDATE SKIP LOCKED` |
| `trackedChatCompletion` | Routes fast vs primary models, caches side-effect-free calls, records `AiUsageLog` |

## Frontend structure

- **App Router** under `src/app/`
- **Dashboard layout** — `src/app/dashboard/layout.tsx` + `Sidebar.tsx`
- **DataProvider** — client-side data fetching wrapper
- **UI components** — `src/components/ui/` (shadcn-style)

Pages are mostly client components calling `/api/*` with fetch.

## Security model

- Session-based auth via Better Auth; API routes require valid session (except Telegram webhook, cron with `CRON_SECRET`, OAuth callbacks)
- OAuth state HMAC in `integrations/oauth-state.ts` (15-minute expiry)
- Integration tokens stored in DB (`Integration.accessToken`) — treat as secrets
- User data isolated by `userId` on all queries
- Rate limiting per user/action in `rate-limit.ts`

## Extension points

When adding features, prefer:

1. New functions in `src/lib/<domain>.ts`
2. Prisma model + migration/push
3. Thin route in `src/app/api/<name>/route.ts`
4. Optional: Telegram handler + agent-router pattern
5. Optional: `publishAppEvent` type for webhooks

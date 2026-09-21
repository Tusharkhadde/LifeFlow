# Agent guide — LifeFlow AI

This file is the **primary onboarding document for AI coding agents**. Read it before making changes.

## What this product is

LifeFlow AI is a **personal OS / AI second brain**:

- Save URLs, notes, documents → indexed in a **knowledge vault** with embeddings
- Ask questions → **hybrid search** (local vault + personal memory + context graph) + **Exa.ai** web search + LLM synthesis
- **Telegram bot** as the main mobile interface (save links, search, tasks, expenses, habits)
- **Productivity**: tasks, reminders, daily briefing, weekly review
- **Finance**: expenses, budgets, savings goals, bill autopilot, SMS parsing
- **Integrations**: Google Calendar sync, Notion import, webhooks, Chrome extension
- **SaaS surface**: Today command center, API keys (`/api/v1/*`), share links, activity, notifications, command palette

There is **no billing/subscription UI** in the codebase (premium-ready features exist without payment flows).

## Repository map

```
lifeflow/
├── prisma/schema.prisma     # All data models — read before DB changes
├── src/
│   ├── app/
│   │   ├── api/             # Thin REST route handlers
│   │   ├── dashboard/       # Authenticated dashboard pages
│   │   ├── assistant/       # Web AI chat
│   │   └── settings/        # User settings
│   ├── components/          # React UI (Sidebar, DataProvider, widgets)
│   └── lib/                 # Business logic — prefer adding code here
│       ├── agent-router.ts      # Telegram message orchestration
│       ├── search-pipeline.ts   # Exa + hybrid RAG + LLM (core search)
│       ├── knowledge-engine.ts  # URL scrape + AI synthesis on save
│       ├── hybrid-search.ts     # Keyword + embedding cosine search
│       ├── productivity-actions.ts
│       ├── integrations/        # Google Calendar, Notion OAuth + sync
│       ├── command-center.ts    # Today overview aggregator
│       ├── morning-agent.ts     # Run-my-morning OS agent
│       ├── assistant-agent.ts   # Tool-calling streaming assistant
│       ├── agent-tools.ts       # Shared tool registry (assistant + MCP)
│       ├── meeting-intelligence.ts # Transcript → tasks/decisions/memory
│       ├── context-graph.ts     # Life graph + autoLinkGraph()
│       ├── api-keys.ts          # Hashed lf_live_ keys
│       └── ...
├── chrome-extension/        # Browser clipper (load unpacked)
├── docs/                    # Architecture & product docs
└── .env.example             # Required environment variables
```

## Architecture principles

1. **Thin API routes, fat `src/lib/`** — Route handlers authenticate, parse JSON, call lib functions, return JSON.
2. **User scoping** — Almost every query filters by `userId` from `getAuthenticatedUserId()`.
3. **Events** — `publishAppEvent()` in `src/lib/events.ts` logs app events and fires user webhooks.
4. **Telegram flow** — `POST /api/telegram` → slash commands handled inline → everything else → `agentRouter.route()`.
5. **Search flow** — `executeSmartSearch()` in `search-pipeline.ts`: rate limit → hybrid local search → Exa → LLM → save history + extract memories.
6. **API keys** — `getAuthenticatedUserId()` accepts session cookies or `Authorization: Bearer lf_live_...`.
7. **Tools are the contract** — add capabilities to `agent-tools.ts` (`TOOL_DISPATCH` + `ALL_TOOLS_DEFINITIONS`); the web assistant and `/api/mcp` pick them up automatically.
8. **Graph side effects** — call `void autoLinkGraph(userId, text, source, hints)` after creating user content; never await it on the request path.

## Before you edit

| Task | Read first |
|------|------------|
| New API endpoint | `src/lib/auth-helpers.ts`, similar route in `src/app/api/` |
| Telegram behavior | `src/app/api/telegram/route.ts`, `src/lib/agent-router.ts` |
| Search / RAG | `src/lib/search-pipeline.ts`, `src/lib/hybrid-search.ts`, `src/lib/exa-search.ts` |
| Knowledge save | `src/lib/knowledge-engine.ts` |
| DB schema change | `prisma/schema.prisma`, then `npx prisma db push` |
| New integration | `src/lib/integrations/`, `src/app/api/integrations/` |
| Dashboard page | Copy pattern from `src/app/dashboard/workspace/page.tsx` |
| Sidebar nav | `src/components/Sidebar.tsx` → `navItems` array |

## Coding conventions

- **TypeScript** throughout; use existing naming (`camelCase` functions, `PascalCase` components).
- **Minimal diffs** — match surrounding style; don't refactor unrelated code.
- **No demo user in production** — `getAuthenticatedUserIdOrDemo()` is dev-only fallback.
- **Async side effects** — Calendar sync uses `void syncLifeFlowItemToIntegrations(...)` after create/update.
- **BigInt** — Telegram IDs stored as `BigInt` in Prisma.
- **AI config** — `getAIConfig()` in `ai-provider.ts`; supports OpenAI-compatible APIs and optional Hugging Face override.

## Environment variables (critical)

See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for the full list. Minimum to run locally:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- `EXA_API_KEY` (required for smart search / Telegram queries)

Optional: `TELEGRAM_BOT_TOKEN`, Google/Notion OAuth, embedding model.

## Common agent tasks

### Add a dashboard feature

1. Add Prisma model if needed → `prisma db push`
2. Create `src/lib/<feature>.ts` with business logic
3. Create `src/app/api/<feature>/route.ts`
4. Create `src/app/dashboard/<feature>/page.tsx`
5. Add nav item in `Sidebar.tsx`

### Wire Telegram command

1. Add handler in `src/app/api/telegram/route.ts` (for `/commands`)
2. Or add natural-language pattern in `src/lib/agent-router.ts`

### Add integration

Follow Google Calendar / Notion pattern:

- `src/lib/integrations/<provider>.ts` — OAuth + API calls
- `src/lib/integrations/store.ts` — token CRUD
- `src/app/api/integrations/<provider>/auth|callback|route.ts`
- UI in `/dashboard/integrations`

## What NOT to do

- Don't commit `.env` or secrets
- Don't add pricing/billing unless explicitly requested
- Don't replace `agent-router` with LangGraph wholesale — `agent-langgraph.ts` exists but Telegram primarily uses `agent-router.ts`
- Don't skip `userId` filtering on database queries
- Don't create commits unless the user asks

## Related docs

- [docs/PRODUCT.md](./docs/PRODUCT.md) — feature inventory
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — diagrams and data flows
- [docs/DATABASE.md](./docs/DATABASE.md) — schema reference
- [docs/API.md](./docs/API.md) — endpoint list
- [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) — OAuth setup

## Build notes

- `npm run build` runs `prisma generate && next build`
- `npm run typecheck`, `npm test`, and `npm run test:e2e` are the local quality gates. CI uses Node 20 and PostgreSQL 16.
- Classification and extraction use `OPENAI_FAST_MODEL` (or the user's fast-model override). Synthesis and the assistant use the primary model. `OPENAI_FALLBACK_MODEL` is tried once when the primary request fails. Monthly spend is capped by `monthlyAiBudgetUsd`.
- On Windows, Next.js SWC binary issues have been reported — TypeScript can still be checked via `npm run typecheck`
- Vercel crons: `/api/telegram/notify` (daily 8:00), `/api/weekly-review` (Sunday 9:00)

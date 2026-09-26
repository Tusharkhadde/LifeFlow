# Product overview — LifeFlow AI

## Vision

LifeFlow AI is a **unified personal operating system**: one place to capture knowledge, get AI answers grounded in your data and the web, and manage daily life (tasks, money, habits) from web or Telegram.

**Target user**: knowledge workers, students, and power users who want a private second brain with automation — not another siloed notes app.

## Core value pillars

### 1. AI Knowledge Vault

- Save URLs → auto-scrape, summarize, tag, embed
- Save notes, documents (OCR), voice transcriptions
- Hybrid search: keyword + embedding similarity over vault
- Personal memory (`PersonalMemory`) and context graph (`ContextEntity` / `ContextRelation`)
- Duplicate URL detection
- Collections, knowledge graph visualization, export

### 2. Smart search (Exa-first)

Telegram and web queries use **`executeSmartSearch`**:

1. Rate limit check
2. Search local vault + memories + context
3. **Exa.ai** live web search (when configured)
4. LLM synthesizes answer with citations
5. Save to search history; extract durable facts into memory/graph

After search, bot may suggest `/save <url>` for useful web results.

### 3. Productivity

- Tasks (optional due date) and reminders
- Daily briefing, weekly review, monthly report
- Proactive alerts (expiring docs, budget warnings, habit nudges)
- Google Calendar two-way sync (push tasks/reminders, pull events)

### 4. Finance

- Manual and natural-language expense logging
- Bank SMS parsing (INR-focused patterns)
- Category budgets, savings goals
- Recurring bill detection (bill autopilot)
- Usage limits tracked per action type

### 5. Habits & wellness

- Create habits, log daily, streak calculation
- Telegram: `track habit X`, natural log commands

### 6. Collaboration (lightweight)

- Workspaces with invite codes
- Shared feed view (knowledge + expenses across members)

### 7. Automation & extensions

- Outbound webhooks on app events (Zapier, Make, n8n)
- Chrome extension for quick save (`chrome-extension/`) with API key support
- SSE event stream (`/api/events/stream`)
- AI personas (coach, concise, researcher, etc.)

### 8. Agentic layer

- **Tool-using assistant** (`/assistant`, `POST /api/assistant` SSE) — the LLM calls real tools: vault + Exa search, create task/reminder, log expense/habit, process meeting, run Morning OS, remember facts. Streams tokens + tool traces.
- **Meeting intelligence** (`/dashboard/meetings`, `/meeting` on Telegram, voice notes captioned "meeting") — transcript/audio → summary, decisions, tasks (Calendar-synced), memories, people/projects into graph.
- **Auto-linked life graph** — every save, task, expense, email, and meeting extracts people/projects/merchants/topics via LLM (heuristic fallback) and links them in `ContextEntity`/`ContextRelation`.
- **MCP server** (`/api/mcp`) — Streamable HTTP MCP with Bearer API key; Cursor/Claude can use the user's second brain as tools.
- **Gmail ingest** (read-only) — bills → reminders + recurring bills, action emails → tasks, newsletters → vault; dedupes by `metadata.gmailId`.
- **Chrome side-panel copilot** — ask about the current page grounded in your vault (`/api/v1/copilot`), save page, create task, turn selected notes into tasks.

### 9. SaaS product surface

- **Today command center** — briefing, onboarding, tasks, alerts, habits, spend
- **Morning OS agent** — run the day: 60-second briefing, 3 focus tasks, Google Calendar blocks, Telegram voice
- **Public API v1** with hashed API keys
- **Share links** for vault cards (`/s/[token]`)
- **Activity feed**, **notifications**, **collections**, **personal memory**
- **Command palette** (`Ctrl/⌘ K`) for navigation + quick capture
- **Export / import** JSON
- Health check at `/api/health`

## User interfaces

| Surface | Path / entry | Primary use |
|---------|--------------|-------------|
| Web dashboard | `/dashboard/*` | Today, vault, expenses, habits, developer |
| Ask AI Brain | `/assistant` | Web chat over knowledge |
| Settings | `/settings` | Auth, Telegram link, timezone, persona |
| Telegram bot | `@Bot` webhook | Mobile capture, search, commands |
| Chrome extension | `chrome-extension/` (`/lifeflow-copilot.zip`) | Side panel: ask, save page or selection, create a task |

## Telegram commands (reference)

| Command | Action |
|---------|--------|
| `/link <code>` | Link Telegram to web account |
| `/start`, `/help` | Onboarding help |
| `/search <query>` | Exa + RAG search |
| `/save <url>` | Save URL to vault |
| `/task <text> due <when>` | Create task |
| `/remind <text> at <when>` | Create reminder |
| `/morning` | Run Morning OS: briefing + 3 focus tasks + calendar |
| `/meeting <notes>` | Meeting → summary, decisions, tasks; voice note captioned "meeting" also works |
| `/weekly` | Weekly review |
| `/memory`, `/forget <text>` | Personal memories |
| `/context` | Context graph |
| `/expenses`, `/habits`, `/bills`, `/report` | Finance & habits |
| `/persona <id>` | Switch AI persona |
| `/goal <name> ₹<amount>` | Savings goal |
| `/timezone Area/City` | Set timezone |
| `/confirm`, `/cancel` | Approve pending AI actions |
| Natural language | Parsed by `agent-router.ts` (URLs, expenses, reminders, "run my morning", search) |

## Feature modules → code

| Module | Key files |
|--------|-----------|
| Knowledge save | `knowledge-engine.ts`, `web-scraper.ts` |
| Search | `search-pipeline.ts`, `exa-search.ts`, `hybrid-search.ts` |
| Telegram | `api/telegram/route.ts`, `agent-router.ts`, `telegram.ts` |
| Tasks/reminders | `productivity-actions.ts`, `api/tasks`, `api/reminders` |
| Morning OS | `morning-agent.ts`, `api/morning` |
| Assistant (tools) | `assistant-agent.ts`, `agent-tools.ts`, `api/assistant` |
| Meetings | `meeting-intelligence.ts`, `api/meetings`, `dashboard/meetings` |
| Life graph | `context-graph.ts` (`autoLinkGraph`, `linkEntities`) |
| MCP | `api/mcp/route.ts` (reuses `agent-tools.ts`) |
| Gmail | `integrations/gmail.ts`, `api/integrations/gmail/*` |
| Browser copilot | `chrome-extension/sidepanel.*`, `api/v1/copilot` |
| Expenses | `expense-actions.ts`, `expense-parser.ts`, `sms-parser.ts` |
| Budgets/goals | `budgets-goals.ts`, `api/budgets`, `api/goals` |
| Habits | `habit-actions.ts`, `api/habits` |
| Documents/OCR | `document-ocr.ts`, `api/documents` |
| Integrations | `lib/integrations/*`, `dashboard/integrations` |
| Webhooks | `webhooks.ts`, `events.ts`, `api/webhooks` |
| Usage limits | `usage-stats.ts`, `ai-telemetry.ts`, `rate-limit.ts`, `dashboard/usage` |

Settings expose a monthly AI budget and an optional fast-model override. Classification, extraction, and graph linking use the fast model and may be cached. Search synthesis and the assistant use the primary model, with one fallback-model retry. The Usage page shows monthly cost, cache hits, and a per-operation breakdown. Prompts are not stored in `AiUsageLog`.

## Explicitly out of scope (today)

- Payment / subscription / Stripe / Razorpay UI
- WhatsApp integration (discussed, not built)
- Full LangGraph replacement of agent-router (partial wiring only)

## Monetization-ready (no billing UI)

Usage tracking, rate limits, and premium feature surfaces exist so billing can be added later without restructuring core flows.

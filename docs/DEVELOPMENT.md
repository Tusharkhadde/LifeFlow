# Development guide — LifeFlow AI

## Prerequisites

- Node.js 20+
- PostgreSQL database
- API keys: OpenAI-compatible LLM, Exa.ai (for search)

## Setup

```bash
git clone <repo>
cd lifeflow
npm install
cp .env.example .env
# Edit .env with your values
npx prisma db push
npm run dev
```

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Random 32+ char secret |
| `BETTER_AUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `OPENAI_API_KEY` | LLM API key |
| `OPENAI_BASE_URL` | e.g. `https://api.tokenrouter.com/v1` |
| `OPENAI_MODEL` | Chat model id |
| `EXA_API_KEY` | Exa.ai search (required for smart search) |

### AI / embeddings

| Variable | Description |
|----------|-------------|
| `OPENAI_EMBEDDING_MODEL` | Default: `text-embedding-3-small` |
| `HF_API_KEY`, `HF_BASE_URL`, `HF_MODEL` | Optional Hugging Face override |

### Auth OAuth (optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign-in + Calendar fallback |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub sign-in |

### Integrations

| Variable | Description |
|----------|-------------|
| `GOOGLE_CALENDAR_CLIENT_ID/SECRET` | Optional Calendar-specific OAuth |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | Notion OAuth |

Redirect URIs (replace base URL):

- `{BETTER_AUTH_URL}/api/integrations/google-calendar/callback`
- `{BETTER_AUTH_URL}/api/integrations/notion/callback`

### Telegram

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook verification |
| `CRON_SECRET` | Protects cron endpoints |

## NPM scripts

| Script | Command |
|--------|---------|
| `dev` | `next dev` |
| `build` | `prisma generate && next build` |
| `start` | `next start` |
| `lint` | `next lint` |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest unit tests |
| `test:e2e` | Playwright smoke and auth-gate flows |
| `db:migrate` | `prisma migrate dev` |
| `db:migrate:deploy` | `prisma migrate deploy` |
| `db:push` | `prisma db push` (local schema sync only) |
| `db:seed` | Seed database |
| `rag:eval` | RAG evaluation script |

## Project conventions

### File organization

- **`src/app/api/`** — HTTP handlers only; no heavy logic
- **`src/lib/`** — All business logic, external API clients
- **`src/components/`** — React UI
- **`prisma/schema.prisma`** — Single source of truth for data model

### Adding an API route

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    // call lib function
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

### Auth in development

`getAuthenticatedUserIdOrDemo()` falls back to `demo-user` in `NODE_ENV=development` only. Production requires real sessions.

### Styling

- Tailwind CSS + `glass-card`, `gradient-bg`, `gradient-text` utility classes
- Icons: `lucide-react`
- UI primitives: `src/components/ui/*`

### Telegram local testing

1. Set `TELEGRAM_BOT_TOKEN`
2. Use ngrok or similar for public HTTPS URL
3. `POST /api/telegram/setup` to register webhook
4. Link account via Settings → generate code → `/link <code>`

## Database workflow

```bash
# Existing database: mark the baseline migration applied once, then deploy later migrations
npx prisma migrate resolve --applied 20260921000000_baseline
npx prisma migrate deploy

# Fresh database
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

Production and CI use `prisma migrate deploy`. `db push` is only for local experiments.

## Build troubleshooting

- **Windows SWC error**: Known issue with some Next.js 14 builds; try `npx tsc --noEmit` for type check
- **Prisma client stale**: Run `npx prisma generate`
- **Auth redirect mismatch**: Ensure `BETTER_AUTH_URL` matches browser URL exactly

## Testing

```bash
npm test
npm run typecheck
npm run test:e2e
```

Vitest covers URL safety, expense parsing, API-key scopes, automation conditions, and job backoff. Playwright checks the public landing page, `/api/health`, and that dashboard, inbox, projects, assistant, developer, and privacy routes redirect unauthenticated visitors to `/login`. GitHub Actions (`.github/workflows/ci.yml`) runs migrations, seed, typecheck, lint, unit tests, build, and Playwright against PostgreSQL 16 on Node 20.

Manual scripts remain:

| Script | Purpose |
|--------|---------|
| `scripts/rag-eval.ts` | RAG quality evaluation |
| `scripts/telegram-parser-test.ts` | Telegram parsing |

## Deployment (Vercel)

1. Connect repo to Vercel
2. Set all env vars
3. `DATABASE_URL` → production PostgreSQL
4. Run `prisma db push` against prod DB
5. Crons defined in `vercel.json`

## Public API keys

Create keys at `/dashboard/developer`. Store only the SHA-256 hash. Full key is shown once.

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer lf_live_..." \
  -H "Content-Type: application/json" \
  -d '{"query":"what React tools did I save?"}'
```

After adding `ApiKey`, `ShareLink`, or `Notification` models run:

```bash
npx prisma db push
```

## Code quality rules for agents

- Minimal scope per change
- Match existing patterns
- No secrets in commits
- No unsolicited README/docs updates (unless requested)
- User-scoped queries always filter by `userId`

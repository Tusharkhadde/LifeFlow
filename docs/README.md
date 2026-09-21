# Documentation index

Central index for LifeFlow AI documentation. **AI agents should read [AGENTS.md](../AGENTS.md) first.**

## For AI agents

| File | When to read |
|------|--------------|
| [AGENTS.md](../AGENTS.md) | Always — repo map, conventions, task checklist |
| [PRODUCT.md](./PRODUCT.md) | Understanding features and user flows |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design before structural changes |
| [DATABASE.md](./DATABASE.md) | Any Prisma/schema work |
| [API.md](./API.md) | Adding or modifying REST endpoints |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Setup, env vars, local dev |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | OAuth, Telegram, webhooks, external APIs |

## For humans

| File | When to read |
|------|--------------|
| [README.md](../README.md) | Project overview and quick start |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | First-time setup |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | Connecting Google Calendar, Notion, Telegram |

## Suggested reading order (new agent session)

1. `AGENTS.md` — orientation
2. `PRODUCT.md` — what we're building
3. `ARCHITECTURE.md` — how it's wired
4. Task-specific doc (DATABASE, API, INTEGRATIONS, etc.)

## Keeping docs updated

When you add a major feature, update:

- Feature list in `PRODUCT.md`
- API table in `API.md` if new routes
- Schema section in `DATABASE.md` if new models
- `AGENTS.md` "Repository map" if new core module

# Database schema — LifeFlow AI

PostgreSQL via Prisma. Schema file: `prisma/schema.prisma`.

Apply changes locally:

```bash
npx prisma db push
```

## Entity relationship overview

```
User
 ├── KnowledgeItem, PersonalMemory, Task, Reminder
 ├── Expense, Habit, HabitLog, Budget, SavingsGoal, RecurringBill
 ├── SearchHistory, Collection, UsageLog, UserSettings
 ├── TelegramLink, LinkCode, Conversation → ConversationMessage
 ├── ContextEntity ↔ ContextRelation
 ├── Integration, CalendarSyncMap
 ├── Webhook, AppEvent, Notification
 ├── ApiKey, ShareLink
 ├── Workspace (owner) / WorkspaceMember
 └── Session, Account (Better Auth)
```

## Models by domain

### Auth (Better Auth)

| Model | Purpose |
|-------|---------|
| `User` | Core user; `timezone`, `language` for reminders |
| `Session` | Active sessions |
| `Account` | OAuth/password provider links |
| `Verification` | Email verification tokens |

### Knowledge & AI memory

| Model | Key fields | Notes |
|-------|------------|-------|
| `KnowledgeItem` | `title`, `content`, `summary`, `aiMemory`, `embedding`, `tags`, `metadata` | Vault item; types: link, note, document, audio |
| `PersonalMemory` | `key`, `value`, `confidence`, `source` | Unique per `[userId, key]` |
| `ContextEntity` | `name`, `normalized`, `type` | Graph nodes |
| `ContextRelation` | `fromEntityId`, `toEntityId`, `relation` | Graph edges |
| `SearchHistory` | `query`, `answer`, `exaUsed`, `sourceUrls` | Query log |
| `Collection` | `name`, `itemIds` (JSON array) | Manual/auto collections |

### Productivity

| Model | Key fields | Notes |
|-------|------------|-------|
| `Task` | `title`, `dueAt`, `completed` | Syncs to Google Calendar when due set |
| `Reminder` | `text`, `remindAt`, `completed`, `lastNotifiedAt` | Cron notify uses `lastNotifiedAt` |
| `PendingAction` | `action`, `payload`, `telegramChatId` | Confirm/cancel flow |

### Finance

| Model | Key fields |
|-------|------------|
| `Expense` | `amount`, `currency`, `category`, `merchant`, `source`, `spentAt` |
| `Budget` | `category`, `limitAmount`, `period` |
| `SavingsGoal` | `name`, `targetAmount`, `currentAmount`, `deadline` |
| `RecurringBill` | `name`, `amount`, `frequency`, `nextDueAt`, `active` |

### Habits

| Model | Key fields |
|-------|------------|
| `Habit` | `name`, `frequency`, `targetDays` |
| `HabitLog` | `habitId`, `loggedAt`, `note` |

### Telegram

| Model | Purpose |
|-------|---------|
| `TelegramLink` | Maps `telegramUserId` → `userId` |
| `LinkCode` | 6-digit link codes with expiry |
| `Conversation` | Per chat thread |
| `ConversationMessage` | User/assistant messages; dedupe via `telegramMessageId` |

### Integrations

| Model | Purpose |
|-------|---------|
| `Integration` | OAuth tokens; `provider`: `google_calendar` \| `notion`; `syncEnabled`, `metadata` |
| `CalendarSyncMap` | Maps LifeFlow task/reminder ID → `googleEventId` |

### Platform

| Model | Purpose |
|-------|---------|
| `UserSettings` | `aiPersona`, `voiceBriefingEnabled`, `monthlyBudgetLimit` |
| `UsageLog` | Per-action usage for limits dashboard |
| `Webhook` | Outbound URL + event filter JSON |
| `AppEvent` | Internal event log |
| `Workspace` / `WorkspaceMember` | Team spaces with invite codes |
| `ApiKey` | Hashed `lf_live_` keys; prefix only is shown after create |
| `ShareLink` | Public vault share tokens + view counts |
| `Notification` | In-app inbox generated from key app events |

## Indexes

Most user-facing tables index `[userId, ...]` for list queries. Notable uniques:

- `KnowledgeItem`: no URL unique — duplicate detection is app-level
- `Integration`: `@@unique([userId, provider])`
- `CalendarSyncMap`: `@@unique([userId, lifeflowType, lifeflowId])`
- `TelegramLink.telegramUserId`: unique globally

## JSON fields

| Model | Field | Typical shape |
|-------|-------|---------------|
| `KnowledgeItem` | `tags` | `string[]` |
| `KnowledgeItem` | `metadata` | `{ notionPageId?, notionUrl?, importedAt? }` |
| `KnowledgeItem` | `embedding` | `number[]` |
| `Integration` | `metadata` | `{ calendarId?, workspaceId?, workspaceName?, parentPageId? }` |
| `Webhook` | `events` | `string[]` event types |
| `PendingAction` | `payload` | action-specific object |

## Prisma JSON filtering

Notion duplicate check uses:

```typescript
metadata: { path: ["notionPageId"], equals: notionPageId }
```

Requires PostgreSQL JSON path support via Prisma.

## Seed

```bash
npm run db:seed   # deterministic demo workspace in prisma/seed.ts
```

## Migrations

`prisma/migrations/` is the production history. On an existing database, mark `20260921000000_baseline` applied with `prisma migrate resolve --applied`, then run `prisma migrate deploy`. Fresh databases run `migrate deploy` directly. Backup and restore scripts live in `scripts/db-backup.*` and `scripts/db-restore.*`.

Operational tables added by the hardening migration include `Job`, `AiUsageLog`, `AiCache`, `IntegrationHealth`, `WebhookDelivery`, `AuditLog`, `DataDeletionRequest`, `InboxItem`, `Project`, `ProjectLink`, `AutomationRule`, and `AutomationRun`.

## When changing schema

1. Edit `prisma/schema.prisma`
2. Create a migration with `npm run db:migrate`
3. Update `docs/DATABASE.md` and any affected `src/lib/*` types
4. Regenerate client: `npx prisma generate` (included in build)

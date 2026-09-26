-- Enums
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DEAD');
CREATE TYPE "InboxStatus" AS ENUM ('PENDING', 'SNOOZED', 'ACCEPTED', 'DISMISSED');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "AutomationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- Existing-table extensions
ALTER TABLE "SearchHistory" ADD COLUMN "citations" JSONB;
ALTER TABLE "UserSettings"
  ADD COLUMN "monthlyAiBudgetUsd" DOUBLE PRECISION,
  ADD COLUMN "preferredFastModel" TEXT,
  ADD COLUMN "triageMode" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN "dailyTriageEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastTriageAt" TIMESTAMP(3),
  ADD COLUMN "productTourCompletedAt" TIMESTAMP(3),
  ADD COLUMN "demoSeededAt" TIMESTAMP(3),
  ADD COLUMN "retentionDays" INTEGER NOT NULL DEFAULT 365;
ALTER TABLE "ApiKey"
  ADD COLUMN "scopes" JSONB NOT NULL DEFAULT '["*"]',
  ADD COLUMN "rateLimitPerHour" INTEGER NOT NULL DEFAULT 120;

-- Convert free-form workspace roles while preserving existing rows.
ALTER TABLE "WorkspaceMember" ADD COLUMN "role_new" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER';
UPDATE "WorkspaceMember"
SET "role_new" = CASE LOWER("role")
  WHEN 'owner' THEN 'OWNER'::"WorkspaceRole"
  WHEN 'admin' THEN 'ADMIN'::"WorkspaceRole"
  WHEN 'viewer' THEN 'VIEWER'::"WorkspaceRole"
  ELSE 'MEMBER'::"WorkspaceRole"
END;
ALTER TABLE "WorkspaceMember" DROP COLUMN "role";
ALTER TABLE "WorkspaceMember" RENAME COLUMN "role_new" TO "role";

CREATE TABLE "Job" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userId" TEXT,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "result" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "latencyMs" INTEGER,
  "requestId" TEXT,
  "jobId" TEXT,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCache" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationHealth" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastError" TEXT,
  "latencyMs" INTEGER,
  "metadata" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationHealth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT,
  "eventType" TEXT NOT NULL,
  "status" INTEGER,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "responseMs" INTEGER,
  "error" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'user',
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "requestId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "executeAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "status" TEXT NOT NULL DEFAULT 'active',
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboxItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceRef" TEXT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "payload" JSONB NOT NULL,
  "status" "InboxStatus" NOT NULL DEFAULT 'PENDING',
  "snoozedUntil" TIMESTAMP(3),
  "projectId" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "triagedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "relation" TEXT NOT NULL DEFAULT 'belongs_to',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trigger" JSONB NOT NULL,
  "conditions" JSONB NOT NULL DEFAULT '[]',
  "actions" JSONB NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "runCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "triggerEventId" TEXT,
  "status" "AutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "depth" INTEGER NOT NULL DEFAULT 0,
  "input" JSONB,
  "output" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "WorkspaceShare" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "access" TEXT NOT NULL DEFAULT 'view',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");
CREATE INDEX "Job_userId_name_createdAt_idx" ON "Job"("userId", "name", "createdAt");
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");
CREATE INDEX "AiUsageLog_operation_createdAt_idx" ON "AiUsageLog"("operation", "createdAt");
CREATE UNIQUE INDEX "AiCache_key_key" ON "AiCache"("key");
CREATE INDEX "AiCache_userId_operation_expiresAt_idx" ON "AiCache"("userId", "operation", "expiresAt");
CREATE INDEX "AiCache_expiresAt_idx" ON "AiCache"("expiresAt");
CREATE UNIQUE INDEX "IntegrationHealth_userId_provider_key" ON "IntegrationHealth"("userId", "provider");
CREATE INDEX "IntegrationHealth_status_updatedAt_idx" ON "IntegrationHealth"("status", "updatedAt");
CREATE UNIQUE INDEX "WebhookDelivery_webhookId_eventId_attempt_key" ON "WebhookDelivery"("webhookId", "eventId", "attempt");
CREATE INDEX "WebhookDelivery_userId_createdAt_idx" ON "WebhookDelivery"("userId", "createdAt");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "DataDeletionRequest_status_executeAt_idx" ON "DataDeletionRequest"("status", "executeAt");
CREATE INDEX "DataDeletionRequest_userId_createdAt_idx" ON "DataDeletionRequest"("userId", "createdAt");
CREATE UNIQUE INDEX "Project_userId_name_key" ON "Project"("userId", "name");
CREATE INDEX "Project_userId_status_updatedAt_idx" ON "Project"("userId", "status", "updatedAt");
CREATE UNIQUE INDEX "InboxItem_userId_source_sourceRef_key" ON "InboxItem"("userId", "source", "sourceRef");
CREATE INDEX "InboxItem_userId_status_createdAt_idx" ON "InboxItem"("userId", "status", "createdAt");
CREATE INDEX "InboxItem_projectId_status_idx" ON "InboxItem"("projectId", "status");
CREATE UNIQUE INDEX "ProjectLink_projectId_targetType_targetId_key" ON "ProjectLink"("projectId", "targetType", "targetId");
CREATE INDEX "ProjectLink_userId_targetType_targetId_idx" ON "ProjectLink"("userId", "targetType", "targetId");
CREATE INDEX "AutomationRule_userId_enabled_updatedAt_idx" ON "AutomationRule"("userId", "enabled", "updatedAt");
CREATE UNIQUE INDEX "AutomationRun_ruleId_triggerEventId_key" ON "AutomationRun"("ruleId", "triggerEventId");
CREATE INDEX "AutomationRun_userId_startedAt_idx" ON "AutomationRun"("userId", "startedAt");
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
CREATE UNIQUE INDEX "WorkspaceShare_workspaceId_targetType_targetId_key" ON "WorkspaceShare"("workspaceId", "targetType", "targetId");
CREATE INDEX "WorkspaceShare_userId_createdAt_idx" ON "WorkspaceShare"("userId", "createdAt");

ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCache" ADD CONSTRAINT "AiCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationHealth" ADD CONSTRAINT "IntegrationHealth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectLink" ADD CONSTRAINT "ProjectLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLink" ADD CONSTRAINT "ProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceShare" ADD CONSTRAINT "WorkspaceShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceShare" ADD CONSTRAINT "WorkspaceShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

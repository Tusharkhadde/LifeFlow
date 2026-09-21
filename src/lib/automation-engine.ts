import { AutomationRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { TOOL_DISPATCH } from "@/lib/agent-tools";
import { logger } from "@/lib/logger";

interface RuleTrigger {
  type: "event" | "schedule" | "inbox";
  event?: string;
  cadence?: "hourly" | "daily" | "weekly";
}

interface RuleCondition {
  field: string;
  op: "equals" | "not_equals" | "contains" | "gt" | "gte" | "lt" | "lte" | "exists";
  value?: unknown;
}

interface RuleAction {
  type: "notification" | "create_task" | "create_reminder" | "save_knowledge" | "run_tool";
  params: Record<string, unknown>;
}

const ALLOWED_TOOLS = new Set([
  "createTask",
  "createReminder",
  "saveKnowledgeItem",
  "logHabit",
  "rememberFact",
]);

function getPath(value: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function matchesCondition(input: Record<string, unknown>, condition: RuleCondition) {
  const actual = getPath(input, condition.field);
  switch (condition.op) {
    case "equals":
      return String(actual) === String(condition.value);
    case "not_equals":
      return String(actual) !== String(condition.value);
    case "contains":
      return String(actual || "").toLowerCase().includes(String(condition.value || "").toLowerCase());
    case "gt":
      return Number(actual) > Number(condition.value);
    case "gte":
      return Number(actual) >= Number(condition.value);
    case "lt":
      return Number(actual) < Number(condition.value);
    case "lte":
      return Number(actual) <= Number(condition.value);
    case "exists":
      return actual !== undefined && actual !== null;
    default:
      return false;
  }
}

function resolveTemplates(value: unknown, input: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, path: string) => {
      const resolved = getPath(input, path.trim());
      return resolved == null ? "" : String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, input));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveTemplates(item, input),
      ])
    );
  }
  return value;
}

async function executeAction(
  userId: string,
  action: RuleAction,
  input: Record<string, unknown>
) {
  const params = resolveTemplates(action.params || {}, input) as Record<string, unknown>;
  if (action.type === "notification") {
    return createNotification(userId, {
      title: String(params.title || "LifeFlow automation"),
      message: String(params.message || "An automation ran."),
      type: "automation",
      href: params.href ? String(params.href) : "/dashboard/automation",
    });
  }
  const toolName =
    action.type === "create_task"
      ? "createTask"
      : action.type === "create_reminder"
        ? "createReminder"
        : action.type === "save_knowledge"
          ? "saveKnowledgeItem"
          : String(params.tool || "");
  if (!ALLOWED_TOOLS.has(toolName)) throw new Error(`Tool ${toolName} is not allowed in automations`);
  const handler = TOOL_DISPATCH[toolName];
  if (!handler) throw new Error(`Tool ${toolName} is unavailable`);
  const toolParams =
    action.type === "run_tool"
      ? ((params.arguments || {}) as Record<string, unknown>)
      : params;
  const result = await handler(userId, toolParams);
  if (!result.success) throw new Error(result.message);
  return result.data || { message: result.message };
}

export async function runAutomationRule(
  ruleId: string,
  userId: string,
  input: Record<string, unknown>,
  triggerEventId?: string,
  depth = 0
) {
  if (depth > 2) throw new Error("Automation depth limit reached");
  const rule = await prisma.automationRule.findFirst({ where: { id: ruleId, userId, enabled: true } });
  if (!rule) return { skipped: true, reason: "Rule disabled or missing" };

  const conditions = (Array.isArray(rule.conditions) ? rule.conditions : []) as unknown as RuleCondition[];
  if (!conditions.every((condition) => matchesCondition(input, condition))) {
    return { skipped: true, reason: "Conditions did not match" };
  }

  let run;
  try {
    run = await prisma.automationRun.create({
      data: {
        userId,
        ruleId,
        triggerEventId,
        depth,
        input: input as Prisma.InputJsonValue,
      },
    });
  } catch {
    return { skipped: true, reason: "Already processed" };
  }

  try {
    const outputs = [];
    const actions = (Array.isArray(rule.actions) ? rule.actions : []) as unknown as RuleAction[];
    if (actions.length > 8) throw new Error("Automation has too many actions");
    for (const action of actions) {
      outputs.push(await executeAction(userId, action, input));
    }
    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationRunStatus.COMPLETED,
          output: JSON.parse(JSON.stringify(outputs)) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      }),
      prisma.automationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      }),
    ]);
    return { runId: run.id, outputs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: AutomationRunStatus.FAILED,
        error: message.slice(0, 4000),
        completedAt: new Date(),
      },
    });
    logger.error("automation.failed", { userId, operation: rule.name, error });
    throw error;
  }
}

export async function runAutomationsForEvent(
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
  eventId: string
) {
  if (eventType === "automation_ran") return [];
  const rules = await prisma.automationRule.findMany({ where: { userId, enabled: true } });
  const matching = rules.filter((rule) => {
    const trigger = rule.trigger as unknown as RuleTrigger;
    return trigger.type === "event" && (trigger.event === eventType || trigger.event === "*");
  });
  const input = { event: eventType, payload, eventId };
  const results = [];
  for (const rule of matching.slice(0, 20)) {
    results.push(await runAutomationRule(rule.id, userId, input, eventId).catch((error) => ({
      error: error instanceof Error ? error.message : "Failed",
    })));
  }
  return results;
}

function cadenceDue(cadence: RuleTrigger["cadence"], lastRunAt: Date | null) {
  if (!lastRunAt) return true;
  const elapsed = Date.now() - lastRunAt.getTime();
  if (cadence === "hourly") return elapsed >= 60 * 60 * 1000;
  if (cadence === "weekly") return elapsed >= 7 * 86400000;
  return elapsed >= 86400000;
}

export async function runScheduledAutomations() {
  const rules = await prisma.automationRule.findMany({ where: { enabled: true }, take: 200 });
  const scheduled = rules.filter((rule) => {
    const trigger = rule.trigger as unknown as RuleTrigger;
    return trigger.type === "schedule" && cadenceDue(trigger.cadence || "daily", rule.lastRunAt);
  });
  const bucket = new Date().toISOString().slice(0, 13);
  const results = [];
  for (const rule of scheduled) {
    results.push(
      await runAutomationRule(
        rule.id,
        rule.userId,
        { schedule: rule.trigger, timestamp: new Date().toISOString() },
        `schedule:${rule.id}:${bucket}`
      ).catch((error) => ({ error: error instanceof Error ? error.message : "Failed" }))
    );
  }
  return results;
}

export const AUTOMATION_TEMPLATES = [
  {
    id: "expense-alert",
    name: "Large expense alert",
    description: "Notify me whenever an expense over ₹5,000 is logged.",
    trigger: { type: "event", event: "expense_created" },
    conditions: [{ field: "payload.amount", op: "gte", value: 5000 }],
    actions: [
      {
        type: "notification",
        params: {
          title: "Large expense logged",
          message: "₹{{payload.amount}} was added to {{payload.category}}.",
          href: "/dashboard/expenses",
        },
      },
    ],
  },
  {
    id: "meeting-followup",
    name: "Meeting follow-up",
    description: "Create a reminder after every processed meeting.",
    trigger: { type: "event", event: "meeting_processed" },
    conditions: [],
    actions: [
      {
        type: "create_reminder",
        params: { text: "Review follow-ups from {{payload.title}}", when: "tomorrow" },
      },
    ],
  },
  {
    id: "daily-morning",
    name: "Daily Morning OS",
    description: "Run Morning OS every day and notify me when the plan is ready.",
    trigger: { type: "schedule", cadence: "daily" },
    conditions: [],
    actions: [
      {
        type: "notification",
        params: {
          title: "Run your Morning OS",
          message: "Your daily planning ritual is ready.",
          href: "/dashboard/today",
        },
      },
    ],
  },
] as const;

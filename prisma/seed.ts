import { createHash } from "crypto";
import { PrismaClient, WorkspaceRole } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_USER_ID = "demo-user";
const DEMO_API_KEY = "lf_live_demo_key_for_local_development_only";
const BASE_DATE = new Date("2026-09-21T08:00:00.000Z");

async function main() {
  console.log("Seeding deterministic LifeFlow demo workspace...");

  const existing = await prisma.user.findUnique({ where: { email: "demo@lifeflow.ai" } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const demoUser = await prisma.user.create({
    data: {
      id: DEMO_USER_ID,
      email: "demo@lifeflow.ai",
      name: "Tushar Demo",
      username: "demouser",
      language: "en",
      timezone: "Asia/Kolkata",
      emailVerified: true,
    },
  });

  await prisma.userSettings.create({
    data: {
      userId: demoUser.id,
      aiPersona: "executive",
      voiceBriefingEnabled: false,
      monthlyBudgetLimit: 50000,
      monthlyAiBudgetUsd: 10,
      triageMode: "review",
      demoSeededAt: BASE_DATE,
    },
  });

  await prisma.knowledgeItem.createMany({
    data: [
      {
        id: "demo-knowledge-shadcn",
        userId: demoUser.id,
        title: "shadcn/ui — Accessible React Components",
        summary: "A collection of accessible components copied into your project and customized with Tailwind CSS.",
        aiMemory: "Use shadcn/ui for composable, owned UI components in React products.",
        content: "shadcn/ui provides Radix-based components with Tailwind styling and full source ownership.",
        type: "link",
        sourceUrl: "https://ui.shadcn.com",
        category: "Development",
        tags: ["react", "ui", "components"],
        favorite: true,
        createdAt: BASE_DATE,
      },
      {
        id: "demo-knowledge-agent",
        userId: demoUser.id,
        title: "Agentic product architecture",
        summary: "Notes on reliable tool-calling agents, idempotent jobs, observability, and human approval.",
        aiMemory: "Reliable agents need typed tools, retries, audit trails, and approval boundaries.",
        content: "Design agents around small deterministic tools. Queue long-running work and retain a complete audit trail.",
        type: "note",
        category: "AI",
        tags: ["agents", "architecture", "saas"],
        favorite: true,
        createdAt: new Date(BASE_DATE.getTime() + 3600000),
      },
      {
        id: "demo-knowledge-meeting",
        userId: demoUser.id,
        title: "Project Atlas weekly sync",
        summary: "The team agreed to ship the onboarding flow and measure activation before expanding integrations.",
        aiMemory: "Project Atlas prioritizes onboarding activation this week.",
        content: "Decision: ship onboarding. Action: Tushar owns the demo walkthrough. Priya validates analytics.",
        type: "note",
        category: "Meeting",
        tags: ["meeting", "project-atlas"],
        metadata: { kind: "meeting", people: ["Tushar", "Priya"], projects: ["Project Atlas"] },
        createdAt: new Date(BASE_DATE.getTime() + 7200000),
      },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        id: "demo-task-onboarding",
        userId: demoUser.id,
        title: "Finish Project Atlas onboarding",
        description: "Connect the inbox, tour, and activation analytics.",
        dueAt: new Date("2026-09-22T12:30:00.000Z"),
      },
      {
        id: "demo-task-demo",
        userId: demoUser.id,
        title: "Record LifeFlow product demo",
        dueAt: new Date("2026-09-23T10:00:00.000Z"),
      },
      {
        id: "demo-task-security",
        userId: demoUser.id,
        title: "Review OAuth token encryption",
        completed: true,
        dueAt: new Date("2026-09-20T10:00:00.000Z"),
      },
    ],
  });

  await prisma.reminder.createMany({
    data: [
      {
        id: "demo-reminder-bill",
        userId: demoUser.id,
        text: "Pay internet bill",
        remindAt: new Date("2026-09-22T03:30:00.000Z"),
      },
      {
        id: "demo-reminder-call",
        userId: demoUser.id,
        text: "Call Priya about activation metrics",
        remindAt: new Date("2026-09-22T09:30:00.000Z"),
      },
    ],
  });

  await prisma.expense.createMany({
    data: [
      { id: "demo-expense-1", userId: demoUser.id, amount: 799, category: "utilities", merchant: "Jio Fiber", description: "Internet", source: "email", spentAt: new Date("2026-09-18T08:00:00.000Z") },
      { id: "demo-expense-2", userId: demoUser.id, amount: 450, category: "food", merchant: "Subway", description: "Lunch", source: "assistant", spentAt: new Date("2026-09-20T07:30:00.000Z") },
      { id: "demo-expense-3", userId: demoUser.id, amount: 1200, category: "software", merchant: "Vercel", description: "Hosting", source: "manual", spentAt: BASE_DATE },
    ],
  });

  const habit = await prisma.habit.create({
    data: {
      id: "demo-habit-deep-work",
      userId: demoUser.id,
      name: "Deep work",
      description: "One focused block every day",
    },
  });
  await prisma.habitLog.createMany({
    data: [0, 1, 2, 3].map((daysAgo) => ({
      id: `demo-habit-log-${daysAgo}`,
      userId: demoUser.id,
      habitId: habit.id,
      loggedAt: new Date(BASE_DATE.getTime() - daysAgo * 86400000),
    })),
  });

  const project = await prisma.project.create({
    data: {
      id: "demo-project-atlas",
      userId: demoUser.id,
      name: "Project Atlas",
      description: "Turn LifeFlow into a production-grade AI personal operating system.",
      color: "#8b5cf6",
    },
  });
  await prisma.projectLink.createMany({
    data: [
      { id: "demo-link-project-task", userId: demoUser.id, projectId: project.id, targetType: "task", targetId: "demo-task-onboarding" },
      { id: "demo-link-project-meeting", userId: demoUser.id, projectId: project.id, targetType: "meeting", targetId: "demo-knowledge-meeting" },
      { id: "demo-link-project-note", userId: demoUser.id, projectId: project.id, targetType: "knowledge", targetId: "demo-knowledge-agent" },
    ],
  });

  await prisma.inboxItem.createMany({
    data: [
      {
        id: "demo-inbox-email",
        userId: demoUser.id,
        source: "gmail",
        sourceRef: "demo-email-action",
        kind: "action",
        title: "Approve analytics dashboard",
        summary: "Priya requested approval before tomorrow's stakeholder demo.",
        payload: { actionText: "Review and approve analytics dashboard", dueInDays: 1 },
        projectId: project.id,
        priority: 80,
      },
      {
        id: "demo-inbox-article",
        userId: demoUser.id,
        source: "web",
        sourceRef: "demo-web-ai-cost",
        kind: "knowledge",
        title: "AI cost-control patterns",
        summary: "Save this article to the vault and link it to Project Atlas.",
        payload: { input: "https://example.com/ai-cost-controls" },
        projectId: project.id,
        priority: 40,
      },
    ],
  });

  await prisma.automationRule.create({
    data: {
      id: "demo-automation-overdue",
      userId: demoUser.id,
      name: "Overdue task alert",
      description: "Create a notification whenever a task becomes overdue.",
      trigger: { type: "event", event: "task_updated" },
      conditions: [{ field: "completed", op: "equals", value: false }],
      actions: [{ type: "notification", params: { title: "Task needs attention", message: "Review the updated task." } }],
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      id: "demo-workspace",
      name: "LifeFlow Demo Team",
      ownerId: demoUser.id,
      inviteCode: "DEMO-ATLAS-2026",
    },
  });
  await prisma.workspaceMember.create({
    data: {
      id: "demo-workspace-owner",
      workspaceId: workspace.id,
      userId: demoUser.id,
      role: WorkspaceRole.OWNER,
    },
  });

  await prisma.apiKey.create({
    data: {
      id: "demo-api-key",
      userId: demoUser.id,
      name: "Local demo key",
      keyHash: createHash("sha256").update(DEMO_API_KEY).digest("hex"),
      prefix: DEMO_API_KEY.slice(0, 15),
      scopes: ["*"],
    },
  });

  await prisma.contextEntity.createMany({
    data: [
      { id: "demo-entity-atlas", userId: demoUser.id, name: "Project Atlas", normalized: "project atlas", type: "project" },
      { id: "demo-entity-priya", userId: demoUser.id, name: "Priya", normalized: "priya", type: "person" },
      { id: "demo-entity-lifeflow", userId: demoUser.id, name: "LifeFlow AI", normalized: "lifeflow ai", type: "product" },
    ],
  });
  await prisma.contextRelation.createMany({
    data: [
      { id: "demo-relation-1", userId: demoUser.id, fromEntityId: "demo-entity-priya", toEntityId: "demo-entity-atlas", relation: "works_on", source: "demo seed" },
      { id: "demo-relation-2", userId: demoUser.id, fromEntityId: "demo-entity-atlas", toEntityId: "demo-entity-lifeflow", relation: "part_of", source: "demo seed" },
    ],
  });

  await prisma.searchHistory.create({
    data: {
      id: "demo-search",
      userId: demoUser.id,
      query: "What should I prioritize for Project Atlas?",
      answer: "Ship onboarding, verify activation analytics, then record the product demo.",
      source: "demo",
      exaUsed: false,
      sourceUrls: [],
      citations: [
        { id: "demo-knowledge-meeting", kind: "vault", title: "Project Atlas weekly sync", score: 0.94 },
      ],
      createdAt: BASE_DATE,
    },
  });

  console.log(`Database seeded. Demo API key: ${DEMO_API_KEY}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request.headers);
    const format = new URL(request.url).searchParams.get("format") || "json";
    const [
      profile,
      settings,
      knowledge,
      memories,
      entities,
      relations,
      tasks,
      reminders,
      expenses,
      habits,
      searches,
      collections,
      projects,
      projectLinks,
      inbox,
      automations,
      events,
      notifications,
      audit,
      integrations,
      apiKeys,
      shares,
      webhooks,
      workspaces,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          language: true,
          timezone: true,
          createdAt: true,
        },
      }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.knowledgeItem.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          content: true,
          summary: true,
          aiMemory: true,
          type: true,
          sourceUrl: true,
          category: true,
          tags: true,
          favorite: true,
          archived: true,
          metadata: true,
          expiryDate: true,
          extractedAmount: true,
          documentType: true,
          vendor: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.personalMemory.findMany({ where: { userId } }),
      prisma.contextEntity.findMany({ where: { userId } }),
      prisma.contextRelation.findMany({ where: { userId } }),
      prisma.task.findMany({ where: { userId } }),
      prisma.reminder.findMany({ where: { userId } }),
      prisma.expense.findMany({ where: { userId } }),
      prisma.habit.findMany({ where: { userId }, include: { logs: true } }),
      prisma.searchHistory.findMany({ where: { userId } }),
      prisma.collection.findMany({ where: { userId } }),
      prisma.project.findMany({ where: { userId } }),
      prisma.projectLink.findMany({ where: { userId } }),
      prisma.inboxItem.findMany({ where: { userId } }),
      prisma.automationRule.findMany({
        where: { userId },
        include: { runs: { orderBy: { startedAt: "desc" }, take: 20 } },
      }),
      prisma.appEvent.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.auditLog.findMany({ where: { userId } }),
      prisma.integration.findMany({
        where: { userId },
        select: {
          provider: true,
          scope: true,
          metadata: true,
          syncEnabled: true,
          lastSyncAt: true,
          createdAt: true,
        },
      }),
      prisma.apiKey.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      }),
      prisma.shareLink.findMany({
        where: { userId },
        select: {
          id: true,
          knowledgeItemId: true,
          viewCount: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.webhook.findMany({
        where: { userId },
        select: { id: true, url: true, events: true, active: true, createdAt: true },
      }),
      prisma.workspaceMember.findMany({
        where: { userId },
        include: { workspace: { select: { id: true, name: true, ownerId: true, createdAt: true } } },
      }),
    ]);

    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      profile,
      settings,
      knowledge,
      memories,
      contextGraph: { entities, relations },
      tasks,
      reminders,
      expenses,
      habits,
      searches,
      collections,
      projects,
      projectLinks,
      inbox,
      automations,
      events,
      notifications,
      audit,
      integrations,
      apiKeys,
      shares,
      webhooks,
      workspaces,
    };

    await writeAuditLog(userId, "privacy.exported", {
      resourceType: "user",
      resourceId: userId,
      metadata: { format },
    });

    if (format === "markdown") {
      const markdown = [
        "# LifeFlow Export",
        `Exported: ${data.exportedAt}`,
        "",
        "## Knowledge Vault",
        ...knowledge.map(
          (item) =>
            `- **${item.title}** (${item.type}): ${item.aiMemory || item.summary || ""}${
              item.sourceUrl ? ` [source](${item.sourceUrl})` : ""
            }`
        ),
        "",
        "## Personal Memory",
        ...memories.map((memory) => `- **${memory.key}:** ${memory.value}`),
        "",
        "## Tasks",
        ...tasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.title}`),
        "",
        "## Projects",
        ...projects.map((project) => `- **${project.name}** — ${project.description || ""}`),
        "",
        "## Expenses",
        ...expenses.map((expense) => `- ₹${expense.amount} ${expense.category} ${expense.merchant || ""}`),
      ].join("\n");
      return new NextResponse(markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": "attachment; filename=lifeflow-export.md",
        },
      });
    }

    return NextResponse.json(data, {
      headers: { "Content-Disposition": "attachment; filename=lifeflow-export.json" },
    });
  } catch {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

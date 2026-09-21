import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function ensureProject(
  userId: string,
  name: string,
  options: { description?: string; color?: string } = {}
) {
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) throw new Error("Project name is required");
  const project = await prisma.project.upsert({
    where: { userId_name: { userId, name: cleanName } },
    create: {
      userId,
      name: cleanName,
      description: options.description,
      color: options.color || "#6366f1",
    },
    update: {
      status: "active",
      ...(options.description ? { description: options.description } : {}),
    },
  });
  const normalized = cleanName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ");
  if (normalized) {
    const entity = await prisma.contextEntity.upsert({
      where: { userId_normalized: { userId, normalized } },
      create: { userId, name: cleanName, normalized, type: "project" },
      update: { name: cleanName, type: "project" },
    });
    if (project.entityId !== entity.id) {
      return prisma.project.update({ where: { id: project.id }, data: { entityId: entity.id } });
    }
  }
  return project;
}

export async function linkToProject(
  userId: string,
  projectId: string,
  targetType: string,
  targetId: string,
  relation = "belongs_to"
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new Error("Project not found");
  return prisma.projectLink.upsert({
    where: { projectId_targetType_targetId: { projectId, targetType, targetId } },
    create: { userId, projectId, targetType, targetId, relation },
    update: { relation },
  });
}

export async function unlinkFromProject(
  userId: string,
  projectId: string,
  targetType: string,
  targetId: string
) {
  return prisma.projectLink.deleteMany({ where: { userId, projectId, targetType, targetId } });
}

export async function listProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { links: true, inboxItems: true } } },
  });
}

export async function updateProject(
  userId: string,
  id: string,
  data: { name?: string; description?: string; color?: string; status?: string }
) {
  const current = await prisma.project.findFirst({ where: { id, userId } });
  if (!current) throw new Error("Project not found");
  return prisma.project.update({
    where: { id },
    data: {
      ...(data.name?.trim() ? { name: data.name.trim().slice(0, 120) } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.color ? { color: data.color } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
  });
}

export async function getProjectHub(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { links: { orderBy: { createdAt: "desc" } }, inboxItems: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!project) return null;

  const ids = (type: string) =>
    project.links.filter((link) => link.targetType === type).map((link) => link.targetId);
  const [tasks, reminders, knowledge, expenses, people, activity] = await Promise.all([
    ids("task").length
      ? prisma.task.findMany({ where: { userId, id: { in: ids("task") } }, orderBy: { dueAt: "asc" } })
      : [],
    ids("reminder").length
      ? prisma.reminder.findMany({ where: { userId, id: { in: ids("reminder") } }, orderBy: { remindAt: "asc" } })
      : [],
    [...ids("knowledge"), ...ids("meeting")].length
      ? prisma.knowledgeItem.findMany({
          where: { userId, id: { in: [...ids("knowledge"), ...ids("meeting")] } },
          orderBy: { createdAt: "desc" },
        })
      : [],
    ids("expense").length
      ? prisma.expense.findMany({ where: { userId, id: { in: ids("expense") } }, orderBy: { spentAt: "desc" } })
      : [],
    ids("person").length
      ? prisma.contextEntity.findMany({ where: { userId, id: { in: ids("person") } } })
      : project.entityId
        ? prisma.contextRelation
            .findMany({
              where: {
                userId,
                OR: [{ fromEntityId: project.entityId }, { toEntityId: project.entityId }],
              },
              include: { fromEntity: true, toEntity: true },
              take: 20,
            })
            .then((relations) =>
              relations
                .flatMap((relation) => [relation.fromEntity, relation.toEntity])
                .filter((entity) => entity.id !== project.entityId && entity.type === "person")
            )
        : [],
    prisma.appEvent.findMany({
      where: {
        userId,
        OR: [
          { payload: { path: ["projectId"], equals: projectId } },
          { payload: { path: ["project"], equals: project.name } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return {
    project,
    tasks,
    reminders,
    knowledge,
    meetings: knowledge.filter((item) => item.category === "Meeting"),
    expenses,
    people: Array.from(new Map(people.map((person) => [person.id, person])).values()),
    inbox: project.inboxItems,
    activity,
    totals: {
      openTasks: tasks.filter((task) => !task.completed).length,
      spend: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      knowledge: knowledge.length,
      inbox: project.inboxItems.filter((item) => item.status === "PENDING").length,
    },
  };
}

export async function promoteCollectionToProject(userId: string, collectionId: string) {
  const collection = await prisma.collection.findFirst({ where: { id: collectionId, userId } });
  if (!collection) throw new Error("Collection not found");
  const project = await ensureProject(userId, collection.name, {
    description: collection.description || undefined,
    color: collection.color,
  });
  const itemIds = Array.isArray(collection.itemIds) ? (collection.itemIds as string[]) : [];
  for (const itemId of itemIds) {
    await linkToProject(userId, project.id, "knowledge", itemId);
  }
  return project;
}

export function projectLinkInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

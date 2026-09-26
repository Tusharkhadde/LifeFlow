import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { writeAuditLog } from "@/lib/audit-log";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

function generateInviteCode() {
  return randomBytes(16).toString("base64url");
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  minimum: WorkspaceRole = WorkspaceRole.VIEWER
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member || ROLE_RANK[member.role] < ROLE_RANK[minimum]) {
    throw new Error("Workspace permission denied");
  }
  return member;
}

export async function createWorkspace(userId: string, name: string) {
  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim().slice(0, 120),
      ownerId: userId,
      inviteCode: generateInviteCode(),
      members: { create: { userId, role: WorkspaceRole.OWNER } },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  await writeAuditLog(userId, "workspace.created", {
    resourceType: "workspace",
    resourceId: workspace.id,
  });
  return workspace;
}

export async function joinWorkspace(userId: string, inviteCode: string) {
  const workspace = await prisma.workspace.findUnique({ where: { inviteCode } });
  if (!workspace) return null;
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    create: { workspaceId: workspace.id, userId, role: WorkspaceRole.MEMBER },
    update: {},
  });
  await writeAuditLog(userId, "workspace.joined", {
    resourceType: "workspace",
    resourceId: workspace.id,
  });
  return { id: workspace.id, name: workspace.name, createdAt: workspace.createdAt };
}

export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
          _count: { select: { members: true, shares: true } },
        },
      },
    },
  });
  return memberships.map((membership) => ({
    ...membership,
    workspace: {
      ...membership.workspace,
      inviteCode:
        membership.role === WorkspaceRole.OWNER || membership.role === WorkspaceRole.ADMIN
          ? membership.workspace.inviteCode
          : null,
    },
  }));
}

export async function shareWithWorkspace(
  userId: string,
  workspaceId: string,
  targetType: string,
  targetId: string,
  access = "view"
) {
  await requireWorkspaceRole(workspaceId, userId, WorkspaceRole.MEMBER);
  return prisma.workspaceShare.upsert({
    where: { workspaceId_targetType_targetId: { workspaceId, targetType, targetId } },
    create: { workspaceId, userId, targetType, targetId, access },
    update: { access },
  });
}

export async function unshareFromWorkspace(
  userId: string,
  workspaceId: string,
  targetType: string,
  targetId: string
) {
  const share = await prisma.workspaceShare.findUnique({
    where: { workspaceId_targetType_targetId: { workspaceId, targetType, targetId } },
  });
  if (!share) return { count: 0 };
  if (share.userId !== userId) {
    await requireWorkspaceRole(workspaceId, userId, WorkspaceRole.ADMIN);
  }
  return prisma.workspaceShare.deleteMany({ where: { id: share.id } });
}

export async function getWorkspaceFeed(workspaceId: string, userId: string) {
  await requireWorkspaceRole(workspaceId, userId, WorkspaceRole.VIEWER);
  const [shares, memberCount] = await Promise.all([
    prisma.workspaceShare.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
  ]);
  const ids = (type: string) => shares.filter((share) => share.targetType === type).map((share) => share.targetId);
  const [knowledge, expenses, tasks, projects] = await Promise.all([
    ids("knowledge").length
      ? prisma.knowledgeItem.findMany({ where: { id: { in: ids("knowledge") }, archived: false }, take: 30 })
      : [],
    ids("expense").length
      ? prisma.expense.findMany({ where: { id: { in: ids("expense") } }, take: 20 })
      : [],
    ids("task").length
      ? prisma.task.findMany({ where: { id: { in: ids("task") } }, take: 20 })
      : [],
    ids("project").length
      ? prisma.project.findMany({ where: { id: { in: ids("project") } }, take: 20 })
      : [],
  ]);
  return { knowledge, expenses, tasks, projects, shares, memberCount };
}

export async function rotateWorkspaceInvite(userId: string, workspaceId: string) {
  await requireWorkspaceRole(workspaceId, userId, WorkspaceRole.ADMIN);
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { inviteCode: generateInviteCode() },
    select: { inviteCode: true },
  });
}

export async function updateWorkspaceMember(
  actorId: string,
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole
) {
  await requireWorkspaceRole(workspaceId, actorId, WorkspaceRole.ADMIN);
  if (role === WorkspaceRole.OWNER) throw new Error("Use ownership transfer");
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member || member.role === WorkspaceRole.OWNER) throw new Error("Member cannot be changed");
  return prisma.workspaceMember.update({ where: { id: memberId }, data: { role } });
}

export async function removeWorkspaceMember(
  actorId: string,
  workspaceId: string,
  memberUserId: string
) {
  const actor = await requireWorkspaceRole(workspaceId, actorId, WorkspaceRole.MEMBER);
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
  });
  if (!target || target.role === WorkspaceRole.OWNER) throw new Error("Owner cannot be removed");
  if (actorId !== memberUserId && ROLE_RANK[actor.role] < ROLE_RANK[WorkspaceRole.ADMIN]) {
    throw new Error("Workspace permission denied");
  }
  return prisma.workspaceMember.delete({ where: { id: target.id } });
}

export async function transferWorkspaceOwnership(
  ownerId: string,
  workspaceId: string,
  nextOwnerId: string
) {
  await requireWorkspaceRole(workspaceId, ownerId, WorkspaceRole.OWNER);
  const next = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: nextOwnerId } },
  });
  if (!next) throw new Error("New owner must already be a member");
  await prisma.$transaction([
    prisma.workspace.update({ where: { id: workspaceId }, data: { ownerId: nextOwnerId } }),
    prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: ownerId } },
      data: { role: WorkspaceRole.ADMIN },
    }),
    prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: nextOwnerId } },
      data: { role: WorkspaceRole.OWNER },
    }),
  ]);
}

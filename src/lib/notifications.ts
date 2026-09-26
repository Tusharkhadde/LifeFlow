import { prisma } from "@/lib/db";

export async function createNotification(
  userId: string,
  data: { title: string; message: string; type: string; href?: string }
) {
  return prisma.notification.create({
    data: {
      userId,
      title: data.title,
      message: data.message,
      type: data.type,
      href: data.href,
    },
  });
}

export async function listNotifications(userId: string, limit = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationsRead(userId: string, id?: string) {
  return prisma.notification.updateMany({
    where: id ? { userId, id } : { userId, read: false },
    data: { read: true },
  });
}

export async function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(params: {
    userId: string;
    type?: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type || NotificationType.APPLICATION_STATUS_CHANGED,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
        metadata: (params.metadata as any) ?? null,
      },
    });
  }

  async listForUser(userId: string, limitInput?: string | number) {
    const parsed = Number(limitInput ?? 30);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 30;
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount };
  }

  async markRead(userId: string, notificationId: string) {
    const notif = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notif) {
      throw new NotFoundException('Notification not found.');
    }

    return this.prisma.notification.update({
      where: { id: notif.id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }
}

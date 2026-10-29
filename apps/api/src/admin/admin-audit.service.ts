import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorId: string | undefined | null,
    action: string,
    targetType: string,
    targetId?: string | null,
    metadata?: Record<string, any> | null,
  ) {
    if (!actorId) return;
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorId: String(actorId),
          action,
          targetType,
          targetId: targetId ? String(targetId) : null,
          metadata: metadata ? (metadata as any) : undefined,
        },
      });
    } catch {
      // Audit logging must never break primary operations
    }
  }

  async list(query: {
    page?: string | number;
    pageSize?: string | number;
    action?: string;
    targetType?: string;
    search?: string;
  }) {
    const rawPage = Number(query?.page ?? 1);
    const rawPageSize = Number(query?.pageSize ?? 25);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(100, Math.floor(rawPageSize)))
      : 25;

    const where: any = {};
    if (query?.action && String(query.action).trim() && query.action !== 'ALL') {
      where.action = String(query.action).trim();
    }
    if (query?.targetType && String(query.targetType).trim() && query.targetType !== 'ALL') {
      where.targetType = String(query.targetType).trim().toUpperCase();
    }
    if (query?.search && String(query.search).trim()) {
      const q = String(query.search).trim();
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { targetType: { contains: q, mode: 'insensitive' } },
        { targetId: { contains: q, mode: 'insensitive' } },
        { actor: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}

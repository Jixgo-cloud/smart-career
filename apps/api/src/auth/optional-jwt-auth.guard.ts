import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.user = null;
      return true;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      request.user = null;
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload?.sub) {
        const user = await this.prisma.user.findUnique({
          where: { id: String(payload.sub) },
          include: {
            candidateProfile: true,
            companyMembers: {
              include: { company: true },
            },
          },
        });
        if (
          user &&
          user.isActive &&
          (payload.tv ?? 0) === (user.tokenVersion ?? 0)
        ) {
          request.user = user;
          return true;
        }
      }
    } catch {
      // Ignore invalid token on optional routes
    }

    request.user = null;
    return true;
  }
}

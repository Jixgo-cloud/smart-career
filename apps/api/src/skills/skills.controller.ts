import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AZ_204_FRAMEWORK } from '@smartcareer/shared';

@Controller('skills')
export class SkillsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listSkills() {
    return this.prisma.skill.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('frameworks')
  async listFrameworks() {
    const dbFrameworks = await this.prisma.skillFramework.findMany({
      include: {
        items: {
          include: { skill: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    return {
      frameworks: dbFrameworks,
      catalog: [AZ_204_FRAMEWORK],
    };
  }
}

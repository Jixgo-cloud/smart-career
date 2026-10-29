import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RecommendationsService } from './recommendations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get('skill-gaps')
  async getSkillGaps(
    @CurrentUser() user: any,
    @Query() query?: Record<string, any>,
  ) {
    return this.recommendationsService.getSkillGapsAndPlan(user, query || {});
  }

  @Get('courses')
  async getCourses(@Query() query: Record<string, any>) {
    return this.recommendationsService.searchCourses(query || {});
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get('development-plan')
  async getDevelopmentPlan(@CurrentUser() user: any) {
    return this.recommendationsService.getDevelopmentPlan(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Patch('development-plan/:evaluationId/skills/:skillId/progress')
  async updateProgress(
    @CurrentUser() user: any,
    @Param('evaluationId') evaluationId: string,
    @Param('skillId') skillId: string,
    @Body() body: any,
  ) {
    return this.recommendationsService.updateSkillProgress(
      user,
      evaluationId,
      skillId,
      body || {},
    );
  }
}

import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async search(@Query() query: Record<string, any>, @CurrentUser() user: any) {
    return this.jobsService.searchJobs(query, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get('favorites/me')
  async getFavorites(@CurrentUser() user: any) {
    return this.jobsService.getMyFavorites(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/favorite')
  async toggleFavorite(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobsService.toggleFavorite(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get(':id/match')
  async getMatch(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobsService.getJobMatch(id, user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/detail')
  async getDetail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobsService.getJobDetail(id, user);
  }

  @Get(':id')
  async getPublic(@Param('id') id: string) {
    return this.jobsService.getJobPublic(id);
  }
}

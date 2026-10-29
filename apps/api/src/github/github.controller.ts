import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GitHubService } from './github.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@Controller('github')
export class GitHubController {
  constructor(private readonly githubService: GitHubService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post('sync')
  async sync(@CurrentUser() user: any, @Body() body: { username?: string }) {
    return this.githubService.syncCandidateGitHub(user.id, body?.username);
  }

  @Get('public/:username')
  async analyzePublic(@Param('username') username: string) {
    return this.githubService.analyzePublicUser(username);
  }
}

import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CandidateService } from './candidate.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
@Controller('candidate')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.candidateService.getProfile(user.id);
  }

  @Put('profile')
  async updateProfile(@CurrentUser() user: any, @Body() body: Record<string, any>) {
    return this.candidateService.updateProfile(user.id, body || {});
  }

  @Get('radar')
  async getRadar(@CurrentUser() user: any) {
    return this.candidateService.getRadar(user.id);
  }

  @Get('skills')
  async getSkills(@CurrentUser() user: any) {
    return this.candidateService.getSkillsSummary(user.id);
  }

  @Get('applications')
  async getApplications(@CurrentUser() user: any) {
    return this.candidateService.getApplications(user.id);
  }
}

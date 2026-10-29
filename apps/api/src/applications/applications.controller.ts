import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get('my')
  async getMy(@CurrentUser() user: any) {
    return this.applicationsService.getMyApplications(user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':jobId/apply')
  async apply(
    @CurrentUser() user: any,
    @Param('jobId') jobId: string,
    @Body() body: { coverLetter?: string; resumeUrl?: string },
  ) {
    return this.applicationsService.applyToJob(user, jobId, body || {});
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Patch(':id/cancel')
  async cancelPatch(@CurrentUser() user: any, @Param('id') id: string) {
    return this.applicationsService.cancelApplication(user, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Delete(':id')
  async cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.applicationsService.cancelApplication(user, id);
  }

  @Get(':id')
  async getById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.applicationsService.getApplicationById(user, id);
  }
}

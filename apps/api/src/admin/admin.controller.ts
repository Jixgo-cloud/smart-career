import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAudit: AdminAuditService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  async users(@Query() query: Record<string, any>) {
    return this.adminService.listUsers(query || {});
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { isActive?: boolean },
  ) {
    return this.adminService.updateUserStatus(user, id, body || {});
  }

  @Get('skills')
  async skills() {
    return this.adminService.listSkills();
  }

  @Post('skills')
  async createSkill(@CurrentUser() user: any, @Body() body: any) {
    return this.adminService.createSkill(body || {}, user);
  }

  @Delete('skills/:id')
  async deleteSkill(@CurrentUser() user: any, @Param('id') id: string) {
    return this.adminService.deleteSkill(id, user);
  }

  @Get('frameworks')
  async frameworks() {
    return this.adminService.listFrameworks();
  }

  @Get('ingestion-logs')
  async ingestionLogs() {
    return this.adminService.listIngestionLogs();
  }

  @Get('audit-logs')
  async auditLogs(@Query() query: Record<string, any>) {
    return this.adminAudit.list(query || {});
  }

  @Get('jobs')
  async listJobs(@Query() query: Record<string, any>) {
    return this.adminService.listAdminJobs(query || {});
  }

  @Get('companies')
  async listCompanies(@Query() query: Record<string, any>) {
    return this.adminService.listAdminCompanies(query || {});
  }

  @Get('applications')
  async listApplications(@Query() query: Record<string, any>) {
    return this.adminService.listAdminApplications(query || {});
  }

  @Get('verifications')
  async verifications(@Query() query: Record<string, any>) {
    return this.adminService.listVerifications(query || {});
  }

  @Get('verifications/:id/documents/:index')
  async downloadVerificationDoc(
    @Param('id') id: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const doc = await this.adminService.downloadVerificationDocument(id, index);
    res.setHeader('Content-Type', doc.type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.name)}"`,
    );
    return res.send(doc.buffer);
  }

  @Put('verifications/:id/review')
  async reviewVerification(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; reason?: string },
  ) {
    return this.adminService.reviewVerification(user, id, body || ({} as any));
  }

  @Patch('verifications/:id')
  async patchVerification(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    body: {
      status?: 'VERIFIED' | 'REJECTED';
      action?: 'APPROVE' | 'REJECT';
      rejectionReason?: string;
      reason?: string;
    },
  ) {
    const rawAction = body?.action ? String(body.action).trim().toUpperCase() : '';
    const rawStatus = body?.status ? String(body.status).trim().toUpperCase() : '';
    let action: 'APPROVE' | 'REJECT' | null = null;
    if (rawAction === 'APPROVE' || rawAction === 'REJECT') {
      action = rawAction;
    } else if (rawStatus === 'VERIFIED') {
      action = 'APPROVE';
    } else if (rawStatus === 'REJECTED') {
      action = 'REJECT';
    } else if (rawAction || rawStatus) {
      throw new BadRequestException(
        'Invalid action or status. Provide action (APPROVE|REJECT) or status (VERIFIED|REJECTED).',
      );
    } else {
      throw new BadRequestException(
        'Must provide action (APPROVE|REJECT) or status (VERIFIED|REJECTED).',
      );
    }

    return this.adminService.reviewVerification(user, id, {
      action,
      reason: body?.rejectionReason ?? body?.reason,
    });
  }

  @Get('assessments')
  async listAssessments() {
    return this.adminService.listPlatformAssessments();
  }

  @Post('assessments')
  async createAssessment(
    @CurrentUser() user: any,
    @Body() body: Record<string, any>,
  ) {
    return this.adminService.createPlatformAssessment(body || {}, user);
  }

  @Get('assessments/:id')
  async getAssessment(@Param('id') id: string) {
    return this.adminService.getPlatformAssessmentById(id);
  }

  @Put('assessments/:id')
  async updateAssessment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.adminService.updatePlatformAssessment(id, body || {}, user);
  }

  @Delete('assessments/:id')
  async deleteAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.adminService.deletePlatformAssessment(id, user);
  }

  @Patch('assessments/:id/toggle')
  async toggleAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.adminService.togglePlatformAssessment(id, user);
  }

  @Patch('assessments/:id/status')
  async updateAssessmentStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { status?: string; isActive?: boolean },
  ) {
    return this.adminService.updatePlatformAssessmentStatus(id, body || {}, user);
  }

  @Patch('assessments/:id/feedback-visibility')
  async updateAssessmentFeedbackVisibility(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { feedbackVisibility: string },
  ) {
    return this.adminService.updatePlatformAssessmentFeedbackVisibility(
      id,
      body || ({} as any),
      user,
    );
  }

  @Get('assessments/:id/attempts')
  async listAttempts(@Param('id') id: string) {
    return this.adminService.listPlatformAssessmentAttempts(id);
  }
}

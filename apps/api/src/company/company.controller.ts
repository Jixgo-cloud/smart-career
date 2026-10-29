import {
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
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY)
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.companyService.getProfile(user);
  }

  @Put('profile')
  async updateProfile(@CurrentUser() user: any, @Body() body: Record<string, any>) {
    return this.companyService.updateProfile(user, body || {});
  }

  @Post('verify')
  async submitVerification(@CurrentUser() user: any, @Body() body: any) {
    return this.companyService.submitVerification(user, body);
  }

  @Get('verifications/:id/documents/:index')
  async downloadDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const doc = await this.companyService.downloadVerificationDocument(user, id, index);
    res.setHeader('Content-Type', doc.type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.name)}"`,
    );
    return res.send(doc.buffer);
  }

  @Get('jobs')
  async listJobs(@CurrentUser() user: any) {
    const profile = await this.companyService.getProfile(user);
    return profile.jobs || [];
  }

  @Post('jobs')
  async createJob(@CurrentUser() user: any, @Body() body: Record<string, any>) {
    return this.companyService.createJob(user, body || {});
  }

  @Put('jobs/:id')
  async updateJob(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.companyService.updateJob(user, id, body || {});
  }

  @Delete('jobs/:id')
  async deleteJob(@CurrentUser() user: any, @Param('id') id: string) {
    return this.companyService.deleteJob(user, id);
  }

  @Patch('jobs/:id/toggle')
  async toggleJob(@CurrentUser() user: any, @Param('id') id: string) {
    return this.companyService.toggleJobActive(user, id);
  }

  @Get('applications')
  async listApplications(@CurrentUser() user: any, @Query() query: Record<string, any>) {
    return this.companyService.listApplications(user, query || {});
  }

  @Get('applications/export')
  async exportApplications(
    @CurrentUser() user: any,
    @Query('jobId') jobId: string,
    @Res() res: Response,
  ) {
    const csv = await this.companyService.exportApplicationsCsv(user, jobId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="applications-${jobId || 'all'}.csv"`,
    );
    return res.send(csv);
  }

  @Put('applications/:id/status')
  async updateApplicationStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.companyService.updateApplicationStatus(user, id, body || {});
  }

  @Post('applications/:id/assign-assessment')
  async assignAssessment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { assessmentId: string; note?: string },
  ) {
    return this.companyService.assignAssessmentToApplication(user, id, body || ({} as any));
  }

  @Get('candidates/:candidateId')
  async getCandidateProfile(
    @CurrentUser() user: any,
    @Param('candidateId') candidateId: string,
    @Query('applicationId') applicationId?: string,
  ) {
    return this.companyService.getCandidateScreeningProfile(
      user,
      candidateId,
      applicationId,
    );
  }

  @Get('assessments')
  async listAssessments(@CurrentUser() user: any) {
    return this.companyService.listCompanyAssessments(user);
  }

  @Post('assessments')
  async createAssessment(@CurrentUser() user: any, @Body() body: Record<string, any>) {
    return this.companyService.createCompanyAssessment(user, body || {});
  }

  @Get('assessments/:id')
  async getAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.companyService.getCompanyAssessmentById(user, id);
  }

  @Put('assessments/:id')
  async updateAssessment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.companyService.updateCompanyAssessment(user, id, body || {});
  }

  @Delete('assessments/:id')
  async deleteAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.companyService.deleteCompanyAssessment(user, id);
  }

  @Patch('assessments/:id/toggle')
  async toggleAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.companyService.toggleCompanyAssessment(user, id);
  }

  @Get('assessments/:id/attempts')
  async listAssessmentAttemptsById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.companyService.listCompanyAssessmentAttempts(user, id);
  }

  @Get('assessment-attempts')
  async listAttempts(
    @CurrentUser() user: any,
    @Query('assessmentId') assessmentId?: string,
  ) {
    return this.companyService.listCompanyAssessmentAttempts(user, assessmentId);
  }
}

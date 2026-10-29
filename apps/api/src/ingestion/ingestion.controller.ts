import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IngestionService } from './ingestion.service';
import { IngestionConfigService } from './ingestion-config.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly configService: IngestionConfigService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('quotas')
  async getQuotas() {
    return this.configService.getQuotas();
  }

  @Put('quotas')
  async updateQuotas(
    @CurrentUser() user: any,
    @Body() body: Record<string, number>,
  ) {
    const res = this.configService.updateQuotas(body || {});
    await this.audit.log(
      user?.id,
      'INGESTION_QUOTA_UPDATE',
      'INGESTION',
      'quotas',
      { updates: body },
    );
    return res;
  }

  @Post('quotas/reset')
  async resetQuotas(@CurrentUser() user: any) {
    const res = this.configService.resetQuotas();
    await this.audit.log(
      user?.id,
      'INGESTION_QUOTA_RESET',
      'INGESTION',
      'quotas',
    );
    return res;
  }

  @Post('job-runs')
  async startJobRun(
    @CurrentUser() user: any,
    @Body() body: { source: string; limit?: number; requestKey?: string },
  ) {
    const res = await this.ingestionService.startOrFollowJobRun(
      body || ({} as any),
    );
    await this.audit.log(
      user?.id,
      'INGESTION_SYNC_JOBS',
      'INGESTION',
      res?.id,
      { source: body?.source, limit: body?.limit, state: res?.state },
    );
    return res;
  }

  @Post('sync-jobs')
  async syncJobs(
    @CurrentUser() user: any,
    @Query('source') querySource: string,
    @Query('limit') queryLimit: string,
    @Body() body: { source?: string; limit?: number; requestKey?: string },
  ) {
    const source = body?.source || querySource || 'JOBSDB';
    const limit = body?.limit ?? (queryLimit ? Number(queryLimit) : undefined);
    const res = await this.ingestionService.startOrFollowJobRun({
      source,
      limit,
      requestKey: body?.requestKey,
    });
    await this.audit.log(
      user?.id,
      'INGESTION_SYNC_JOBS',
      'INGESTION',
      res?.id,
      { source, limit, state: res?.state },
    );
    return res;
  }

  @Get('job-runs')
  async listJobRuns(@Query('requestKey') requestKey?: string) {
    return this.ingestionService.listJobRuns(requestKey);
  }

  @Get('job-runs/:id')
  async getJobRun(@Param('id') id: string) {
    return this.ingestionService.getJobRunById(id);
  }

  @Post('local-jobs/preview')
  async previewLocalJobs(@Body() batch: any) {
    return this.ingestionService.previewLocalJobs(batch);
  }

  @Post('local-jobs')
  async importLocalJobs(
    @CurrentUser() user: any,
    @Body() body: { batch: any; requestKey?: string },
  ) {
    const res = await this.ingestionService.importLocalJobs(
      body || ({} as any),
    );
    await this.audit.log(
      user?.id,
      'INGESTION_IMPORT_LOCAL',
      'INGESTION',
      res?.id,
      {
        source: res?.source,
        quota: res?.quota,
        state: res?.state,
      },
    );
    return res;
  }

  @Post('sync-courses')
  async syncCourses(
    @CurrentUser() user: any,
    @Query() query: Record<string, any>,
  ) {
    const res = await this.ingestionService.syncCourses(query || {});
    await this.audit.log(
      user?.id,
      'INGESTION_SYNC_COURSES',
      'COURSE',
      String(res?.provider || 'ALL'),
      res as any,
    );
    return res;
  }

  @Post('backfill-skills')
  async backfillSkills(@CurrentUser() user: any) {
    const res = await this.ingestionService.backfillJobSkills();
    await this.audit.log(
      user?.id,
      'INGESTION_BACKFILL_JOB_SKILLS',
      'JOB',
      null,
      res as any,
    );
    return res;
  }

  @Post('backfill-course-skills')
  async backfillCourseSkills(@CurrentUser() user: any) {
    const res = await this.ingestionService.backfillCourseSkills();
    await this.audit.log(
      user?.id,
      'INGESTION_BACKFILL_COURSE_SKILLS',
      'COURSE',
      null,
      res as any,
    );
    return res;
  }

  @Post('enrich-jobs-ai')
  async enrichJobsAi(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const res = await this.ingestionService.enrichJobsAi(limit);
    await this.audit.log(
      user?.id,
      'INGESTION_ENRICH_AI',
      'JOB',
      null,
      res as any,
    );
    return res;
  }

  @Get('preview-closed-jobs')
  async previewClosedJobs(
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ingestionService.previewClosedJobs(source, limit);
  }

  @Post('cleanup-closed-jobs')
  async cleanupClosedJobs(
    @CurrentUser() user: any,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
    @Body() body?: { deleteMode?: string },
  ) {
    const res = await this.ingestionService.cleanupClosedJobs(
      source,
      limit,
      body,
    );
    await this.audit.log(
      user?.id,
      'INGESTION_CLEANUP_JOBS',
      'JOB',
      source || 'ALL',
      {
        deactivatedCount: res.deactivatedCount,
        totalClosedCount: res.totalClosedCount,
      },
    );
    return res;
  }

  @Get('preview-closed-courses')
  async previewClosedCourses(
    @Query('provider') provider?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ingestionService.previewClosedCourses(provider, limit);
  }

  @Post('cleanup-closed-courses')
  async cleanupClosedCourses(
    @CurrentUser() user: any,
    @Body() body: { courseIds: string[] },
  ) {
    const res = await this.ingestionService.cleanupClosedCourses(
      body || ({} as any),
    );
    await this.audit.log(
      user?.id,
      'INGESTION_CLEANUP_COURSES',
      'COURSE',
      null,
      res as any,
    );
    return res;
  }
}

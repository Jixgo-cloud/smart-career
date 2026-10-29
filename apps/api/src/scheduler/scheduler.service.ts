import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IngestionService } from '../ingestion/ingestion.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly ingestionService: IngestionService) {}

  // 00:00 Asia/Bangkok — Daily Job Sync: JSearch -> JobsDB -> Blognone -> JobThai -> Remotive + Closed Jobs Cleanup in one sequential pass
  @Cron('0 0 * * *', { timeZone: 'Asia/Bangkok' })
  async runDailyJobSync() {
    const sources = ['JSEARCH', 'JOBSDB', 'BLOGNONE', 'JOBTHAI', 'REMOTIVE'];
    for (const source of sources) {
      try {
        await this.ingestionService.startOrFollowJobRun({ source });
      } catch (err: any) {
        this.logger.warn(`Scheduled job sync failed for ${source}: ${err?.message}`);
      }
    }
    await this.runDailyClosedJobsCleanup();
  }

  // 00:00 Asia/Bangkok — Daily Course Sync: Udemy -> YouTube + Closed Courses Cleanup in one sequential pass
  @Cron('0 0 * * *', { timeZone: 'Asia/Bangkok' })
  async runDailyCourseSync() {
    for (const provider of ['UDEMY', 'YOUTUBE']) {
      try {
        await this.ingestionService.syncCourses({ provider });
      } catch (err: any) {
        this.logger.warn(`Scheduled course sync failed for ${provider}: ${err?.message}`);
      }
    }
    await this.runDailyClosedCoursesCleanup();
  }

  // Deactivate closed/expired jobs (limit 300) — runs sequentially at the end of runDailyJobSync
  async runDailyClosedJobsCleanup() {
    try {
      await this.ingestionService.cleanupClosedJobs('ALL', 300, {
        deleteMode: 'DEACTIVATE',
      });
    } catch (err: any) {
      this.logger.warn(`Scheduled closed jobs cleanup failed: ${err?.message}`);
    }
  }

  // Delete closed courses (limit 200) — runs sequentially at the end of runDailyCourseSync
  async runDailyClosedCoursesCleanup() {
    try {
      const preview = await this.ingestionService.previewClosedCourses('ALL', 200);
      const courseIds = preview.items.map((c) => c.id);
      if (courseIds.length > 0) {
        await this.ingestionService.cleanupClosedCourses({ courseIds });
      }
    } catch (err: any) {
      this.logger.warn(`Scheduled closed courses cleanup failed: ${err?.message}`);
    }
  }
}

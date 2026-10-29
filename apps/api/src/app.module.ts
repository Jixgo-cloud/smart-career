import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SkillsModule } from './skills/skills.module';
import { GitHubModule } from './github/github.module';
import { CandidateModule } from './candidate/candidate.module';
import { MatchingModule } from './matching/matching.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { CompanyModule } from './company/company.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AdminModule } from './admin/admin.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    NotificationsModule,
    SkillsModule,
    GitHubModule,
    CandidateModule,
    MatchingModule,
    JobsModule,
    ApplicationsModule,
    AssessmentsModule,
    CompanyModule,
    EvaluationsModule,
    RecommendationsModule,
    AdminModule,
    IngestionModule,
    SchedulerModule,
  ],
})
export class AppModule {}

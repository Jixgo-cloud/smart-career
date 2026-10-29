import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [ScheduleModule.forRoot(), IngestionModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}

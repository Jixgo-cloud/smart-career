import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { IngestionConfigService } from './ingestion-config.service';
import { GeminiExtractorService } from './gemini-extractor.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [IngestionController],
  providers: [IngestionService, IngestionConfigService, GeminiExtractorService],
  exports: [IngestionService, IngestionConfigService, GeminiExtractorService],
})
export class IngestionModule {}

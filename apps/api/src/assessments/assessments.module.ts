import { Module } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { AssessmentsController } from './assessments.controller';
import { Judge0Client } from './judge0.client';
import { AiEvaluatorService } from './ai-evaluator.service';

@Module({
  controllers: [AssessmentsController],
  providers: [AssessmentsService, Judge0Client, AiEvaluatorService],
  exports: [AssessmentsService, Judge0Client, AiEvaluatorService],
})
export class AssessmentsModule {}

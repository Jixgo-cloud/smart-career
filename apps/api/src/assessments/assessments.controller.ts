import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AssessmentsService } from './assessments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get()
  async listPublic() {
    return this.assessmentsService.listPublicPlatformAssessments();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get('my-attempts')
  async myAttempts(@CurrentUser() user: any) {
    return this.assessmentsService.getMyAttempts(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Get('my-badges')
  async myBadges(@CurrentUser() user: any) {
    return this.assessmentsService.getMyBadges(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('attempts/:attemptId/review')
  async reviewAttempt(@CurrentUser() user: any, @Param('attemptId') attemptId: string) {
    return this.assessmentsService.getAttemptReview(user, attemptId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('attempts/:attemptId/retry-evaluation')
  async retryEvaluation(@CurrentUser() user: any, @Param('attemptId') attemptId: string) {
    return this.assessmentsService.retryPendingEvaluation(user, attemptId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('attempts/:attemptId/override-score')
  async overrideScore(
    @CurrentUser() user: any,
    @Param('attemptId') attemptId: string,
    @Body()
    body: {
      humanScore: number;
      reviewReason: string;
      reviewFeedback?: string;
    },
  ) {
    return this.assessmentsService.overrideScoreByReviewer(user, attemptId, body || ({} as any));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getDetail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.assessmentsService.getAssessmentDetail(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/start')
  async start(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.startAttempt(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/autosave')
  async autosave(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { attemptId: string; draftCode: Record<string, any> },
  ) {
    return this.assessmentsService.autosaveAttempt(user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/integrity-event')
  async integrityEvent(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { attemptId: string; type: string; metadata?: any },
  ) {
    return this.assessmentsService.recordIntegrityEvent(user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/run-code')
  async runCode(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { attemptId: string; questionId: string; sourceCode: string },
  ) {
    return this.assessmentsService.runCodePublicCases(user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/submit-theory')
  async submitTheory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    body: {
      attemptId: string;
      answers: Array<{ questionId: string; selectedChoiceId: string }>;
    },
  ) {
    return this.assessmentsService.submitTheory(user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/submit-coding')
  async submitCoding(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    body: {
      attemptId: string;
      questionId: string;
      sourceCode: string;
      candidateExplanation?: string;
    },
  ) {
    return this.assessmentsService.submitCodingQuestion(user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @Post(':id/finalize-attempt')
  async finalizeAttempt(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { attemptId: string },
  ) {
    return this.assessmentsService.finalizeCodingAttempt(user, id, body);
  }
}

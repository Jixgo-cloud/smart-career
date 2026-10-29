import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { EvaluationsService } from './evaluations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Roles(UserRole.CANDIDATE)
  @Get('my-feedback')
  async myFeedback(@CurrentUser() user: any) {
    return this.evaluationsService.getMyFeedback(user);
  }

  @Roles(UserRole.COMPANY)
  @Post(':applicationId')
  async upsertEvaluation(
    @CurrentUser() user: any,
    @Param('applicationId') applicationId: string,
    @Body() body: any,
  ) {
    return this.evaluationsService.upsertEvaluation(user, applicationId, body || {});
  }
}

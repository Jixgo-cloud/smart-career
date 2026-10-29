import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminAuditService } from './admin-audit.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService],
  exports: [AdminService, AdminAuditService],
})
export class AdminModule {}

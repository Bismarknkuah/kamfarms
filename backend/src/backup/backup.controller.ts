import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { RecordBackupDto } from './dto/record-backup.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('backup')
@ApiBearerAuth()
@Controller('backups')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @RequirePermission(PERMISSIONS.BACKUP_MANAGE)
  list() {
    return this.backupService.list();
  }

  @Get('status')
  @RequirePermission(PERMISSIONS.BACKUP_MANAGE)
  status() {
    return this.backupService.status();
  }

  @Post()
  @RequirePermission(PERMISSIONS.BACKUP_MANAGE)
  start(@CurrentUser() actor: AuthenticatedUser) {
    return this.backupService.start(actor);
  }

  @Post(':id/complete')
  @RequirePermission(PERMISSIONS.BACKUP_MANAGE)
  recordCompletion(@Param('id') id: string, @Body() dto: RecordBackupDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.backupService.recordCompletion(id, dto, actor);
  }
}

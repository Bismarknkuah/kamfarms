import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AddTaskCommentDto } from './dto/add-task-comment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.tasksService.list(actor, { status, mineOnly: mine === 'true', overdueOnly: overdue === 'true' });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TASKS_ASSIGN)
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasksService.create(dto, actor);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTaskStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasksService.updateStatus(id, dto, actor);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: AddTaskCommentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasksService.addComment(id, dto, actor);
  }
}

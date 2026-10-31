import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserSupportService } from './user-support.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserSupportService],
  exports: [UsersService],
})
export class UsersModule {}

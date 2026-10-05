import { Global, Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { RoleAccessService } from './role-access.service';

/** Global: the sign-in check (JwtStrategy), the control center and the search all consult it. */
@Global()
@Module({ controllers: [AccessController], providers: [RoleAccessService], exports: [RoleAccessService] })
export class AccessModule {}

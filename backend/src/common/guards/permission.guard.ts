import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | string[] | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RequirePermission on this route — being authenticated is enough.
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    const requiredCodes = Array.isArray(required) ? required : [required];
    const hasAny = user && requiredCodes.some((code) => user.permissionCodes.has(code));

    if (!hasAny) {
      throw new ForbiddenException({
        message: `You do not have permission to perform this action (${requiredCodes.join(' or ')}).`,
        errorCode: 'PERMISSION_DENIED',
      });
    }

    return true;
  }
}

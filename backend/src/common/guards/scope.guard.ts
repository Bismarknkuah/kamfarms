import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPE_KEY, ScopeRequirement } from '../decorators/require-scope.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<ScopeRequirement | undefined>(SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    const targetId: string | undefined = request.params?.[requirement.paramName];

    if (!user) {
      throw new ForbiddenException({ message: 'Not authenticated.', errorCode: 'FORBIDDEN' });
    }

    // A GLOBAL scope grant on any of the user's roles always passes.
    const allScopes = user.roles.flatMap((r) => r.scopes);
    const hasGlobal = allScopes.some((s) => s.scopeType === 'GLOBAL');
    if (hasGlobal) return true;

    const hasMatchingScope = allScopes.some(
      (s) => s.scopeType === requirement.scopeType && targetId != null && s.scopeId === targetId,
    );

    if (!hasMatchingScope) {
      throw new ForbiddenException({
        message: `You are not authorized for this ${requirement.scopeType.toLowerCase()}.`,
        errorCode: 'SCOPE_DENIED',
      });
    }

    return true;
  }
}

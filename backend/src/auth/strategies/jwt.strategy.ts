import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload';
import { AuthenticatedUser, ResolvedRole } from '../types/authenticated-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
            scopes: true,
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Account no longer exists.');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    const roles: ResolvedRole[] = user.roles.map((ur) => ({
      roleId: ur.roleId,
      roleCode: ur.role.code,
      permissions: ur.role.permissions.map((rp) => rp.permission.code),
      scopes: ur.scopes.map((s) => ({ scopeType: s.scopeType, scopeId: s.scopeId })),
    }));

    const permissionCodes = new Set<string>();
    roles.forEach((r) => r.permissions.forEach((p) => permissionCodes.add(p)));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles,
      permissionCodes,
    };
  }
}

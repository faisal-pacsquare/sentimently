import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, Customer, Role } from '../customers/customer.types';
import { JsonStore } from '../storage/json-store.service';
import { IS_PUBLIC, ROLES } from './auth.decorators';

/**
 * Global guard: every route needs a valid bearer token unless it is @Public().
 * The customer is re-read on each request, so a deleted account or a changed role takes effect at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly store: JsonStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC,
      targets,
    );
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = await this.authenticate(header.slice(7));
      if (user) req.user = user;
      else if (!isPublic)
        throw new UnauthorizedException(
          'Your session is invalid or has expired',
        );
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Please sign in');

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES,
      targets,
    );
    if (roles && !roles.includes(req.user.role))
      throw new ForbiddenException('You do not have access to this');
    return true;
  }

  private async authenticate(token: string): Promise<AuthUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const customer = await this.store.get<Customer>('customers', payload.sub);
      if (!customer || customer.isGuest) return null;
      return { id: customer.id, role: customer.role };
    } catch {
      return null;
    }
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC,
  PERMISOS_KEY,
  ROL_SUPERADMIN,
  ROLES_KEY,
  UsuarioSesion,
} from './decorators.js';

/**
 * Autorización por @Permisos(...) (todos requeridos) y/o @Roles(...) (alguno).
 * SUPERADMIN pasa siempre. Sin decoradores, basta con estar autenticado.
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const roles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
    const permisos =
      this.reflector.getAllAndOverride<string[]>(PERMISOS_KEY, targets) ?? [];
    if (!roles.length && !permisos.length) return true;

    const user: UsuarioSesion = ctx.switchToHttp().getRequest().user;
    if (user.roles.includes(ROL_SUPERADMIN)) return true;

    const okRol = roles.some((r) => user.roles.includes(r));
    const okPermisos =
      permisos.length > 0 && permisos.every((p) => user.permisos.includes(p));
    if (okRol || okPermisos) return true;

    throw new ForbiddenException('No tienes permisos para esta acción');
  }
}

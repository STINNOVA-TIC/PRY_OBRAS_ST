import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { IS_PUBLIC, JwtPayload } from './decorators.js';
import { cargarSesion } from './sesion.js';

/**
 * Todo endpoint requiere token salvo los marcados con @Public().
 * Además de validar el JWT, recarga el usuario desde la BD: si fue desactivado
 * o le cambiaron roles/permisos, el cambio aplica en la siguiente petición.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token requerido');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const sesion = await cargarSesion(this.db, payload.sub);
    if (!sesion) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }
    req.user = sesion;
    return true;
  }
}

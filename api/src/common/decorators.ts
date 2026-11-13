import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

/** Usuario autenticado, cargado desde la BD en cada request por JwtAuthGuard. */
export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  tieneFirma: boolean;
  contratistaId: string | null;
  requiereCambioPassword: boolean;
  roles: string[];
  permisos: string[];
}

/** Contenido del JWT: solo identifica al usuario; roles y permisos se leen frescos de la BD. */
export interface JwtPayload {
  sub: string;
  email: string;
}

export const IS_PUBLIC = 'isPublic';
/** Marca un endpoint como accesible sin token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Requiere al menos uno de los roles indicados. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISOS_KEY = 'permisos';
/** Requiere TODOS los permisos indicados (ej. 'usuarios.crear'). */
export const Permisos = (...permisos: string[]) =>
  SetMetadata(PERMISOS_KEY, permisos);

/** Inyecta el usuario autenticado en el handler. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioSesion =>
    ctx.switchToHttp().getRequest().user,
);

export const ROL_SUPERADMIN = 'SUPERADMIN';

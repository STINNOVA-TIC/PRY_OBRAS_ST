import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtPayload, UsuarioSesion } from '../common/decorators.js';
import {
  HASH_SENTINELA,
  hashPassword,
  verificarPassword,
} from '../common/password.js';
import { cargarSesion } from '../common/sesion.js';
import { enTransaccion } from '../common/transaccion.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { Usuario } from '../usuarios/entities/usuario.entity.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  async login(email: string, password: string) {
    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();

    // Siempre se compara un hash (aunque el email no exista) para no revelar qué emails existen.
    const ok = await verificarPassword(
      password,
      usuario?.passwordHash ?? HASH_SENTINELA,
    );
    if (!usuario || !ok || !usuario.activo) {
      await this.bitacora.registrar({
        accion: 'Ingreso fallido',
        detalle: `${email}: ${!usuario ? 'el usuario no existe' : !ok ? 'contraseña incorrecta' : 'usuario desactivado'}`,
        usuarioId: usuario?.id ?? null,
        modulo: 'ACCESO',
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.usuarios.update(usuario.id, { ultimoLogin: new Date() });
    await this.bitacora.registrar({ accion: 'Ingresó al sistema', usuarioId: usuario.id, modulo: 'ACCESO' });

    const payload: JwtPayload = { sub: usuario.id, email: usuario.email };
    const sesion = (await cargarSesion(this.db, usuario.id)) as UsuarioSesion;
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: Number(this.config.get('JWT_EXPIRES_IN_SECONDS', 28800)),
      usuario: sesion,
    };
  }

  async cambiarPassword(usuarioId: string, actual: string, nueva: string) {
    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: usuarioId })
      .getOneOrFail();

    if (!(await verificarPassword(actual, usuario.passwordHash))) {
      await this.bitacora.registrar({ accion: 'Intentó cambiar su contraseña', detalle: 'La contraseña actual no coincidió', usuarioId, modulo: 'ACCESO' });
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (await verificarPassword(nueva, usuario.passwordHash)) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta a la actual',
      );
    }

    const passwordHash = await hashPassword(nueva);
    await enTransaccion(this.db, usuarioId, (m) =>
      m.getRepository(Usuario).update(usuarioId, {
        passwordHash,
        requiereCambioPassword: false,
      }),
    );
    await this.bitacora.registrar({ accion: 'Cambió su contraseña', usuarioId, modulo: 'ACCESO' });
    return { mensaje: 'Contraseña actualizada' };
  }
}

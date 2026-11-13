import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { ROL_SUPERADMIN } from '../common/decorators.js';
import { Pagina } from '../common/paginacion.dto.js';
import { generarPasswordTemporal, hashPassword } from '../common/password.js';
import { enTransaccion } from '../common/transaccion.js';
import { BitacoraService } from '../common/bitacora.service.js';
import {
  type ArchivoSubido,
  ArchivosService,
} from '../archivos/archivos.service.js';
import { Permiso } from '../roles/entities/permiso.entity.js';
import { Rol } from '../roles/entities/rol.entity.js';
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
  ExcepcionesPermisosDto,
  ListarUsuariosDto,
} from './dto/usuario.dto.js';
import { UsuarioPermiso } from './entities/usuario-permiso.entity.js';
import { Usuario } from './entities/usuario.entity.js';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioPermiso)
    private readonly excepciones: Repository<UsuarioPermiso>,
    private readonly db: DataSource,
    private readonly archivos: ArchivosService,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar(f: ListarUsuariosDto): Promise<Pagina<Usuario>> {
    const qb = this.usuarios
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .orderBy('u.nombre', 'ASC')
      .skip((f.page - 1) * f.limit)
      .take(f.limit);

    if (f.q?.trim()) {
      const q = `%${f.q.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('u.nombre ILIKE :q', { q })
            .orWhere('u.email ILIKE :q', { q })
            .orWhere('u.cedula ILIKE :q', { q }),
        ),
      );
    }
    if (f.activo !== undefined)
      qb.andWhere('u.activo = :activo', { activo: f.activo });
    if (f.rolId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM usuario_roles x WHERE x.usuario_id = u.id AND x.rol_id = :rolId)',
        { rolId: f.rolId },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: f.page, limit: f.limit };
  }

  async obtener(id: string) {
    const usuario = await this.usuarios.findOne({
      where: { id },
      relations: { roles: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  /** Roles, excepciones y permisos efectivos (lo que realmente puede hacer). */
  async permisos(id: string) {
    const usuario = await this.obtener(id);
    const excepciones = await this.excepciones.find({
      where: { usuarioId: id },
      relations: { permiso: true },
      order: { permiso: { codigo: 'ASC' } },
    });
    const efectivos: { codigo: string }[] = await this.db.query(
      `SELECT DISTINCT codigo FROM vw_permisos_efectivos WHERE usuario_id = $1 ORDER BY codigo`,
      [id],
    );
    return {
      usuarioId: id,
      roles: usuario.roles.map((r) => r.codigo),
      conceder: excepciones
        .filter((e) => e.tipo === 'CONCEDER')
        .map((e) => e.permiso),
      denegar: excepciones
        .filter((e) => e.tipo === 'DENEGAR')
        .map((e) => e.permiso),
      efectivos: efectivos.map((e) => e.codigo),
    };
  }

  async crear(dto: CrearUsuarioDto, actorId: string) {
    await this.validarEmailLibre(dto.email);

    const passwordPlano = dto.password ?? generarPasswordTemporal();
    const passwordHash = await hashPassword(passwordPlano);

    const id = await enTransaccion(this.db, actorId, async (m) => {
      const nuevo = await m.getRepository(Usuario).save({
        nombre: dto.nombre,
        email: dto.email,
        passwordHash,
        cedula: dto.cedula ?? null,
        cargo: dto.cargo ?? null,
        telefono: dto.telefono ?? null,
        contratistaId: dto.contratistaId ?? null,
        requiereCambioPassword: true,
        activo: true,
      });
      if (dto.rolIds?.length) {
        await this.reemplazarRoles(m, nuevo.id, dto.rolIds, actorId);
      }
      const roles = await this.nombresRoles(m, nuevo.id);
      await this.bitacora.registrar(
        {
          accion: `Creó el usuario ${dto.nombre}`,
          detalle: `${dto.email}${roles ? ` · roles: ${roles}` : ''}${dto.password ? '' : ' · con contraseña temporal'}`,
          usuarioId: actorId,
          modulo: 'USUARIOS',
          entidad: 'USUARIO',
          entidadId: nuevo.id,
        },
        m,
      );
      return nuevo.id;
    });

    const usuario = await this.obtener(id);
    // La contraseña temporal solo se devuelve una vez, cuando la generó el sistema.
    return dto.password
      ? usuario
      : { ...usuario, passwordTemporal: passwordPlano };
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto, actorId: string) {
    const actual = await this.obtener(id);
    if (dto.email && dto.email !== actual.email.toLowerCase()) {
      await this.validarEmailLibre(dto.email, id);
    }
    const cambios = BitacoraService.diferencias(
      { ...actual, contratistaId: actual.contratistaId } as Record<string, unknown>,
      dto as Record<string, unknown>,
      { nombre: 'Nombre', email: 'Email', cedula: 'Cédula', cargo: 'Cargo', telefono: 'Teléfono', contratistaId: 'Empresa contratista' },
    );
    await enTransaccion(this.db, actorId, async (m) => {
      if (cambios.length)
        await this.bitacora.registrar(
          { accion: `Editó el usuario ${actual.nombre}`, cambios, usuarioId: actorId, modulo: 'USUARIOS', entidad: 'USUARIO', entidadId: id },
          m,
        );
      return m.getRepository(Usuario).update(id, {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.cedula !== undefined && { cedula: dto.cedula }),
        ...(dto.contratistaId !== undefined && {
          contratistaId: dto.contratistaId,
        }),
        ...(dto.cargo !== undefined && { cargo: dto.cargo }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
      });
    });
    return this.obtener(id);
  }

  async cambiarEstado(id: string, activo: boolean, actorId: string) {
    const usuario = await this.obtener(id);
    if (!activo) {
      if (id === actorId) {
        throw new BadRequestException('No puedes desactivar tu propio usuario');
      }
      if (usuario.roles.some((r) => r.codigo === ROL_SUPERADMIN)) {
        await this.asegurarOtroSuperadmin(id);
      }
    }
    await enTransaccion(this.db, actorId, async (m) => {
      await m.getRepository(Usuario).update(id, {
        activo,
        desactivadoEn: activo ? null : new Date(),
      });
      await this.bitacora.registrar(
        { accion: `${activo ? 'Activó' : 'Desactivó'} el usuario ${usuario.nombre}`, usuarioId: actorId, modulo: 'USUARIOS', entidad: 'USUARIO', entidadId: id },
        m,
      );
    });
    return this.obtener(id);
  }

  /** El administrador fija una contraseña (o se genera una temporal). El usuario deberá cambiarla al ingresar. */
  async resetPassword(
    id: string,
    password: string | undefined,
    actorId: string,
  ) {
    const usuario = await this.obtener(id);
    const plano = password ?? generarPasswordTemporal();
    const passwordHash = await hashPassword(plano);
    await enTransaccion(this.db, actorId, (m) =>
      m.getRepository(Usuario).update(id, {
        passwordHash,
        requiereCambioPassword: true,
      }),
    );
    await this.bitacora.registrar({
      accion: `Restableció la contraseña de ${usuario.nombre}`,
      detalle: password ? 'Contraseña fijada por el administrador' : 'Contraseña temporal generada',
      usuarioId: actorId,
      modulo: 'USUARIOS',
      entidad: 'USUARIO',
      entidadId: id,
    });
    return password
      ? { mensaje: 'Contraseña restablecida' }
      : { mensaje: 'Contraseña restablecida', passwordTemporal: plano };
  }

  async asignarRoles(id: string, rolIds: number[], actorId: string) {
    const usuario = await this.obtener(id);
    const eraSuperadmin = usuario.roles.some(
      (r) => r.codigo === ROL_SUPERADMIN,
    );

    await enTransaccion(this.db, actorId, async (m) => {
      const antes = await this.nombresRoles(m, id);
      await this.reemplazarRoles(m, id, rolIds, actorId);
      const despues = await this.nombresRoles(m, id);
      if (antes !== despues)
        await this.bitacora.registrar(
          {
            accion: `Cambió los roles de ${usuario.nombre}`,
            cambios: [{ campo: 'Roles', antes: antes || null, despues: despues || null }],
            usuarioId: actorId,
            modulo: 'USUARIOS',
            entidad: 'USUARIO',
            entidadId: id,
          },
          m,
        );
      if (eraSuperadmin) {
        const sigue: { n: number }[] = await m.query(
          `SELECT 1 AS n FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = $1 AND r.codigo = $2`,
          [id, ROL_SUPERADMIN],
        );
        if (!sigue.length) await this.asegurarOtroSuperadmin(id, m);
      }
    });
    return this.obtener(id);
  }

  async asignarExcepciones(
    id: string,
    dto: ExcepcionesPermisosDto,
    actorId: string,
  ) {
    const usuario = await this.obtener(id);
    const enAmbas = dto.conceder.filter((p) => dto.denegar.includes(p));
    if (enAmbas.length) {
      throw new BadRequestException(
        `Un permiso no puede estar en conceder y denegar a la vez (ids: ${enAmbas.join(', ')})`,
      );
    }
    const todos = [...dto.conceder, ...dto.denegar];
    if (todos.length) {
      const existen = await this.db
        .getRepository(Permiso)
        .countBy({ id: In(todos), activo: true });
      if (existen !== todos.length) {
        throw new BadRequestException(
          'Uno o más permisos no existen o están inactivos',
        );
      }
    }

    await enTransaccion(this.db, actorId, async (m) => {
      const antes = await this.textoExcepciones(m, id);
      await m.query(`DELETE FROM usuario_permisos WHERE usuario_id = $1`, [id]);
      const filas = [
        ...dto.conceder.map((p) => ({
          usuarioId: id,
          permisoId: p,
          tipo: 'CONCEDER' as const,
        })),
        ...dto.denegar.map((p) => ({
          usuarioId: id,
          permisoId: p,
          tipo: 'DENEGAR' as const,
        })),
      ];
      if (filas.length) await m.getRepository(UsuarioPermiso).insert(filas);
      const despues = await this.textoExcepciones(m, id);
      if (antes !== despues)
        await this.bitacora.registrar(
          {
            accion: `Cambió las excepciones de permisos de ${usuario.nombre}`,
            cambios: [{ campo: 'Excepciones', antes: antes || null, despues: despues || null }],
            usuarioId: actorId,
            modulo: 'USUARIOS',
            entidad: 'USUARIO',
            entidadId: id,
          },
          m,
        );
    });
    return this.permisos(id);
  }

  // -------------------------------------------------------------------

  private async nombresRoles(m: EntityManager, usuarioId: string): Promise<string> {
    const [r] = await m.query(
      `SELECT string_agg(r.nombre, ', ' ORDER BY r.nombre) AS t FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [usuarioId],
    );
    return r?.t ?? '';
  }

  private async textoExcepciones(m: EntityManager, usuarioId: string): Promise<string> {
    const [r] = await m.query(
      `SELECT string_agg(CASE up.tipo WHEN 'CONCEDER' THEN '+' ELSE '−' END || p.codigo, ', ' ORDER BY p.codigo) AS t
         FROM usuario_permisos up JOIN permisos p ON p.id = up.permiso_id WHERE up.usuario_id = $1`,
      [usuarioId],
    );
    return r?.t ?? '';
  }

  private async validarEmailLibre(email: string, exceptoId?: string) {
    const qb = this.usuarios
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email });
    if (exceptoId) qb.andWhere('u.id <> :exceptoId', { exceptoId });
    if (await qb.getExists()) {
      throw new ConflictException('El email ya está registrado');
    }
  }

  /** Deja al usuario exactamente con estos roles (activos). */
  private async reemplazarRoles(
    m: EntityManager,
    usuarioId: string,
    rolIds: number[],
    actorId: string,
  ) {
    const ids = [...new Set(rolIds)];
    if (ids.length) {
      const existen = await m
        .getRepository(Rol)
        .countBy({ id: In(ids), activo: true });
      if (existen !== ids.length) {
        throw new BadRequestException(
          'Uno o más roles no existen o están inactivos',
        );
      }
    }
    await m.query(
      `DELETE FROM usuario_roles WHERE usuario_id = $1 AND NOT (rol_id = ANY($2::int[]))`,
      [usuarioId, ids],
    );
    if (ids.length) {
      // El trigger trg_chk_rol_externo rechaza CONTRATISTA si el usuario no tiene contratista_id
      await m.query(
        `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por)
         SELECT $1, unnest($2::int[]), $3 ON CONFLICT DO NOTHING`,
        [usuarioId, ids, actorId],
      );
    }
  }

  /** Evita quedarse sin ningún SUPERADMIN activo. */
  private async asegurarOtroSuperadmin(excluirId: string, m?: EntityManager) {
    const filas: { n: string }[] = await (m ?? this.db).query(
      `SELECT COUNT(*) AS n FROM usuarios u
         JOIN usuario_roles ur ON ur.usuario_id = u.id
         JOIN roles r ON r.id = ur.rol_id AND r.codigo = $1
        WHERE u.activo AND u.id <> $2`,
      [ROL_SUPERADMIN, excluirId],
    );
    if (Number(filas[0].n) === 0) {
      throw new BadRequestException(
        'Debe quedar al menos un SUPERADMIN activo',
      );
    }
  }

  /**
   * Registra la imagen de firma del usuario (equivale a empleado_firma del POS).
   * Las firmas ya estampadas en documentos conservan la imagen anterior.
   */
  async asignarFirma(
    id: string,
    archivo: ArchivoSubido | undefined,
    actorId: string,
  ) {
    const usuario = await this.obtener(id);
    await enTransaccion(this.db, actorId, async (m) => {
      const guardado = await this.archivos.guardar(
        archivo,
        'FIRMA',
        actorId,
        m,
      );
      await m
        .getRepository(Usuario)
        .update(id, { firmaArchivoId: guardado.id });
      await this.bitacora.registrar(
        {
          accion: id === actorId ? 'Registró su firma' : `Registró la firma de ${usuario.nombre}`,
          usuarioId: actorId,
          modulo: 'USUARIOS',
          entidad: 'USUARIO',
          entidadId: id,
        },
        m,
      );
    });
    return this.obtener(id);
  }

  async quitarFirma(id: string, actorId: string) {
    const usuario = await this.obtener(id);
    await enTransaccion(this.db, actorId, async (m) => {
      await m.getRepository(Usuario).update(id, { firmaArchivoId: null });
      await this.bitacora.registrar(
        { accion: `Quitó la firma de ${usuario.nombre}`, usuarioId: actorId, modulo: 'USUARIOS', entidad: 'USUARIO', entidadId: id },
        m,
      );
    });
    return this.obtener(id);
  }
}

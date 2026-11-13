import { BitacoraService } from '../common/bitacora.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ROL_SUPERADMIN } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import {
  ActualizarRolDto,
  CrearRolDto,
  ListarRolesDto,
} from './dto/rol.dto.js';
import { Modulo } from './entities/modulo.entity.js';
import { Permiso } from './entities/permiso.entity.js';
import { Rol } from './entities/rol.entity.js';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Rol) private readonly roles: Repository<Rol>,
    @InjectRepository(Modulo) private readonly modulos: Repository<Modulo>,
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  listar({ incluirInactivos }: ListarRolesDto) {
    return this.roles.find({
      where: incluirInactivos ? {} : { activo: true },
      relations: { permisos: true },
      order: { id: 'ASC', permisos: { codigo: 'ASC' } },
    });
  }

  async obtener(id: number) {
    const rol = await this.roles.findOne({
      where: { id },
      relations: { permisos: { modulo: true } },
      order: { permisos: { codigo: 'ASC' } },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  /** Catálogo de permisos agrupados por módulo, para armar la matriz en el front. */
  catalogoPermisos() {
    return this.modulos.find({
      where: { activo: true },
      relations: { permisos: true },
      order: { orden: 'ASC', permisos: { codigo: 'ASC' } },
    });
  }

  async crear(dto: CrearRolDto, actorId: string) {
    const existe = await this.roles.exists({ where: { codigo: dto.codigo } });
    if (existe) throw new ConflictException('Ya existe un rol con ese código');

    const id = await enTransaccion(this.db, actorId, async (m) => {
      const rol = await m.getRepository(Rol).save({
        codigo: dto.codigo,
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        esExterno: dto.esExterno ?? false,
        activo: true,
      });
      if (dto.permisoIds?.length) {
        await this.reemplazarPermisos(m, rol.id, dto.permisoIds);
      }
      await this.bitacora.registrar(
        { accion: `Creó el rol ${dto.nombre}`, detalle: `${dto.permisoIds?.length ?? 0} permisos`, usuarioId: actorId, modulo: 'USUARIOS', entidad: 'ROL', entidadId: rol.id },
        m,
      );
      return rol.id;
    });
    return this.obtener(id);
  }

  async actualizar(id: number, dto: ActualizarRolDto, actorId: string) {
    const rol = await this.obtener(id);
    const cambios = BitacoraService.diferencias(rol as unknown as Record<string, unknown>, dto as Record<string, unknown>, {
      nombre: 'Nombre',
      descripcion: 'Descripción',
      esExterno: 'Externo',
    });
    if (cambios.length)
      await this.bitacora.registrar({ accion: `Editó el rol ${rol.nombre}`, cambios, usuarioId: actorId, modulo: 'USUARIOS', entidad: 'ROL', entidadId: id });
    await enTransaccion(this.db, actorId, (m) =>
      m.getRepository(Rol).update(rol.id, {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.esExterno !== undefined && { esExterno: dto.esExterno }),
      }),
    );
    return this.obtener(id);
  }

  async asignarPermisos(id: number, permisoIds: number[], actorId: string) {
    const rol = await this.obtener(id);
    await enTransaccion(this.db, actorId, async (m) => {
      const codigos = async () =>
        new Set<string>(
          (await m.query(`SELECT p.codigo FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = $1`, [id])).map(
            (x: { codigo: string }) => x.codigo,
          ),
        );
      const antes = await codigos();
      await this.reemplazarPermisos(m, id, permisoIds);
      const despues = await codigos();
      const agregados = [...despues].filter((c) => !antes.has(c)).sort();
      const quitados = [...antes].filter((c) => !despues.has(c)).sort();
      if (agregados.length || quitados.length)
        await this.bitacora.registrar(
          {
            accion: `Cambió los permisos del rol ${rol.nombre}`,
            detalle: [agregados.length && `Agregó: ${agregados.join(', ')}`, quitados.length && `Quitó: ${quitados.join(', ')}`]
              .filter(Boolean)
              .join(' · '),
            usuarioId: actorId,
            modulo: 'USUARIOS',
            entidad: 'ROL',
            entidadId: id,
          },
          m,
        );
    });
    return this.obtener(id);
  }

  async cambiarEstado(id: number, activo: boolean, actorId: string) {
    const rol = await this.obtener(id);
    if (!activo && rol.codigo === ROL_SUPERADMIN) {
      throw new BadRequestException('El rol SUPERADMIN no se puede desactivar');
    }
    await enTransaccion(this.db, actorId, async (m) => {
      await m.getRepository(Rol).update(id, { activo });
      await this.bitacora.registrar(
        { accion: `${activo ? 'Activó' : 'Desactivó'} el rol ${rol.nombre}`, usuarioId: actorId, modulo: 'USUARIOS', entidad: 'ROL', entidadId: id },
        m,
      );
    });
    return this.obtener(id);
  }

  /** Deja al rol exactamente con estos permisos (activos). */
  private async reemplazarPermisos(
    m: EntityManager,
    rolId: number,
    permisoIds: number[],
  ) {
    const ids = [...new Set(permisoIds)];
    if (ids.length) {
      const encontrados = await m
        .getRepository(Permiso)
        .countBy({ id: In(ids), activo: true });
      if (encontrados !== ids.length) {
        throw new BadRequestException(
          'Uno o más permisos no existen o están inactivos',
        );
      }
    }
    await m.query(
      `DELETE FROM rol_permisos WHERE rol_id = $1 AND NOT (permiso_id = ANY($2::int[]))`,
      [rolId, ids],
    );
    if (ids.length) {
      await m.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [rolId, ids],
      );
    }
  }
}

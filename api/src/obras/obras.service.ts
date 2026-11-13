import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  asegurarAccesoObra,
  exigirEstado,
  veTodas,
} from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import {
  ActualizarObraDto,
  CambiarEstadoDto,
  CrearObraDto,
  FirmantesDto,
  ListarObrasDto,
} from './dto/obra.dto.js';

/** Columnas editables: dto → columna, con la etiqueta para la bitácora. */
const CAMPOS: Record<keyof ActualizarObraDto, [string, string]> = {
  nombre: ['nombre', 'Nombre'],
  codigo: ['codigo', 'Código'],
  cliente: ['cliente', 'Cliente'],
  ubicacion: ['ubicacion', 'Ubicación'],
  provincia: ['provincia', 'Provincia'],
  descripcion: ['descripcion', 'Descripción'],
  plazoTexto: ['plazo_texto', 'Plazo'],
  fechaInicio: ['fecha_inicio', 'Fecha de inicio'],
  fechaFin: ['fecha_fin', 'Fecha de fin'],
  diasLaborablesSemana: [
    'dias_laborables_semana',
    'Días laborables por semana',
  ],
  ventanaRitmoDias: ['ventana_ritmo_dias', 'Ventana para medir ritmo (días)'],
};

const SELECT_OBRA = `
  SELECT o.id, o.codigo, o.nombre, o.cliente, o.ubicacion, o.provincia, o.descripcion,
         o.plazo_texto AS "plazoTexto", to_char(o.fecha_inicio, 'YYYY-MM-DD') AS "fechaInicio",
         to_char(o.fecha_fin, 'YYYY-MM-DD') AS "fechaFin", o.estado,
         o.administrador_id AS "administradorId", ua.nombre AS "administradorNombre",
         o.superintendente_id AS "superintendenteId", us.nombre AS "superintendenteNombre",
         o.habilitada_en AS "habilitadaEn", o.dias_laborables_semana AS "diasLaborablesSemana",
         o.ventana_ritmo_dias AS "ventanaRitmoDias", o.created_at AS "createdAt", o.updated_at AS "updatedAt",
         b.id AS "bodegaId",
         (SELECT COUNT(*)::int FROM obra_miembros m WHERE m.obra_id = o.id) AS "totalMiembros",
         (SELECT m.funcion FROM obra_miembros m WHERE m.obra_id = o.id AND m.usuario_id = $1) AS "miFuncion",
         COALESCE((SELECT SUM(v.monto_contrato) FROM vw_avance_rubros v WHERE v.obra_id = o.id), 0)::float AS "montoContrato",
         COALESCE((SELECT SUM(v.monto_ejecutado) FROM vw_avance_rubros v WHERE v.obra_id = o.id), 0)::float AS "montoEjecutado"
    FROM obras o
    LEFT JOIN usuarios ua ON ua.id = o.administrador_id
    LEFT JOIN usuarios us ON us.id = o.superintendente_id
    LEFT JOIN bodegas b ON b.obra_id = o.id`;

@Injectable()
export class ObrasService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar(u: UsuarioSesion, f: ListarObrasDto) {
    const params: unknown[] = [u.id];
    const where = ['o.eliminado_en IS NULL'];
    if (!veTodas(u))
      where.push(
        'EXISTS (SELECT 1 FROM obra_miembros m WHERE m.obra_id = o.id AND m.usuario_id = $1)',
      );
    if (f.estado) {
      params.push(f.estado);
      where.push(`o.estado = $${params.length}`);
    }
    if (f.q?.trim()) {
      params.push(`%${f.q.trim()}%`);
      const n = params.length;
      where.push(
        `(o.nombre ILIKE $${n} OR o.codigo ILIKE $${n} OR o.cliente ILIKE $${n} OR o.ubicacion ILIKE $${n})`,
      );
    }
    return this.db.query(
      `${SELECT_OBRA} WHERE ${where.join(' AND ')}
       ORDER BY CASE o.estado WHEN 'ACTIVA' THEN 0 WHEN 'HABILITACION' THEN 1 WHEN 'PAUSADA' THEN 2 ELSE 3 END, o.nombre`,
      params,
    );
  }

  async obtener(u: UsuarioSesion, id: string, m?: EntityManager) {
    const db = m ?? this.db;
    await asegurarAccesoObra(db, u, id);
    const [obra] = await db.query(`${SELECT_OBRA} WHERE o.id = $2`, [u.id, id]);
    const miembros = await db.query(
      `SELECT m.usuario_id AS "usuarioId", us.nombre, us.email, us.cargo, m.funcion,
              (us.firma_archivo_id IS NOT NULL) AS "tieneFirma", us.activo, m.asignado_en AS "asignadoEn"
         FROM obra_miembros m JOIN usuarios us ON us.id = m.usuario_id
        WHERE m.obra_id = $1
        ORDER BY array_position(ARRAY['ADMINISTRADOR','SUPERINTENDENTE','RESIDENTE','BODEGUERO','VISUALIZADOR'], m.funcion::text), us.nombre`,
      [id],
    );
    return { ...obra, miembros };
  }

  async crear(dto: CrearObraDto, u: UsuarioSesion) {
    const id = await enTransaccion(this.db, u.id, async (m) => {
      const [{ id }] = await m.query(
        `INSERT INTO obras (nombre, codigo, cliente, ubicacion, provincia, descripcion, plazo_texto, fecha_inicio, fecha_fin, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          dto.nombre,
          dto.codigo ?? null,
          dto.cliente ?? null,
          dto.ubicacion ?? null,
          dto.provincia ?? null,
          dto.descripcion ?? null,
          dto.plazoTexto ?? null,
          dto.fechaInicio ?? null,
          dto.fechaFin ?? null,
          u.id,
        ],
      );
      // Quien crea la obra queda como Administrador de la misma (igual que en la app real)
      await m.query(
        `INSERT INTO obra_miembros (obra_id, usuario_id, funcion, asignado_por) VALUES ($1, $2, 'ADMINISTRADOR', $2)`,
        [id, u.id],
      );
      await this.bitacora.registrar(
        {
          obraId: id,
          accion: 'Creó la obra',
          detalle: dto.nombre,
          usuarioId: u.id,
        },
        m,
      );
      return id as string;
    });
    return this.obtener(u, id);
  }

  async actualizar(id: string, dto: ActualizarObraDto, u: UsuarioSesion) {
    const actual = await this.obtener(u, id);
    exigirEstado(
      actual.estado,
      ['HABILITACION', 'ACTIVA', 'PAUSADA'],
      'editar la obra',
    );

    const sets: string[] = [];
    const params: unknown[] = [];
    const cambios: { campo: string; antes: unknown; despues: unknown }[] = [];
    for (const [k, [col, etiqueta]] of Object.entries(CAMPOS) as [
      keyof ActualizarObraDto,
      [string, string],
    ][]) {
      const v = dto[k];
      if (v === undefined) continue;
      const antes = (actual as Record<string, unknown>)[k] ?? null;
      if (String(antes ?? '') === String(v ?? '')) continue;
      params.push(v);
      sets.push(`${col} = $${params.length}`);
      cambios.push({ campo: etiqueta, antes, despues: v });
    }
    if (!sets.length) return actual;

    const ini =
      dto.fechaInicio !== undefined ? dto.fechaInicio : actual.fechaInicio;
    const fin = dto.fechaFin !== undefined ? dto.fechaFin : actual.fechaFin;
    if (ini && fin && fin < ini)
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la de inicio',
      );

    await enTransaccion(this.db, u.id, async (m) => {
      params.push(id);
      await m.query(
        `UPDATE obras SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
      await this.bitacora.registrar(
        { obraId: id, accion: 'Editó la obra', cambios, usuarioId: u.id },
        m,
      );
    });
    return this.obtener(u, id);
  }

  /** Baja lógica. Solo si no tiene avances, movimientos de bodega ni planillas. */
  async eliminar(id: string, u: UsuarioSesion) {
    const obra = await this.obtener(u, id);
    const [{ n }] = await this.db.query(
      `SELECT (SELECT COUNT(*) FROM avances WHERE obra_id = $1)
            + (SELECT COUNT(*) FROM planillas WHERE obra_id = $1)
            + (SELECT COUNT(*) FROM movimientos_inventario mv JOIN bodegas b ON b.id = mv.bodega_id WHERE b.obra_id = $1) AS n`,
      [id],
    );
    if (Number(n) > 0) {
      throw new ConflictException(
        'La obra tiene avances, planillas o movimientos de bodega: ciérrala en lugar de eliminarla',
      );
    }
    await enTransaccion(this.db, u.id, async (m) => {
      await m.query(`UPDATE obras SET eliminado_en = now() WHERE id = $1`, [
        id,
      ]);
      await this.bitacora.registrar(
        {
          obraId: id,
          accion: 'Eliminó la obra',
          detalle: obra.nombre,
          usuarioId: u.id,
        },
        m,
      );
    });
    return { mensaje: 'Obra eliminada' };
  }

  // ------------------------------------------------------------- equipo

  async asignarMiembro(
    id: string,
    usuarioId: string,
    funcion: string,
    u: UsuarioSesion,
  ) {
    const obra = await this.obtener(u, id);
    exigirEstado(
      obra.estado,
      ['HABILITACION', 'ACTIVA', 'PAUSADA'],
      'cambiar el equipo',
    );
    const [usr] = await this.db.query(
      `SELECT nombre, activo FROM usuarios WHERE id = $1`,
      [usuarioId],
    );
    if (!usr) throw new NotFoundException('Usuario no encontrado');
    if (!usr.activo)
      throw new BadRequestException('El usuario está desactivado');

    const previo = obra.miembros.find(
      (x: { usuarioId: string }) => x.usuarioId === usuarioId,
    );
    this.validarQueNoSeaFirmanteAfectado(obra, usuarioId, funcion);

    await enTransaccion(this.db, u.id, async (m) => {
      await m.query(
        `INSERT INTO obra_miembros (obra_id, usuario_id, funcion, asignado_por) VALUES ($1, $2, $3, $4)
         ON CONFLICT (obra_id, usuario_id) DO UPDATE SET funcion = EXCLUDED.funcion, asignado_por = EXCLUDED.asignado_por, asignado_en = now()`,
        [id, usuarioId, funcion, u.id],
      );
      await this.bitacora.registrar(
        {
          obraId: id,
          accion: previo
            ? 'Cambió la función de un miembro'
            : 'Agregó un miembro al equipo',
          detalle: `${usr.nombre}: ${funcion}`,
          cambios: previo
            ? [
                {
                  campo: `Función de ${usr.nombre}`,
                  antes: previo.funcion,
                  despues: funcion,
                },
              ]
            : [],
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, id);
  }

  async quitarMiembro(id: string, usuarioId: string, u: UsuarioSesion) {
    const obra = await this.obtener(u, id);
    const previo = obra.miembros.find(
      (x: { usuarioId: string }) => x.usuarioId === usuarioId,
    );
    if (!previo)
      throw new NotFoundException('El usuario no es miembro de la obra');
    this.validarQueNoSeaFirmanteAfectado(obra, usuarioId, null);
    if (
      previo.funcion === 'ADMINISTRADOR' &&
      obra.miembros.filter(
        (x: { funcion: string }) => x.funcion === 'ADMINISTRADOR',
      ).length === 1
    ) {
      throw new BadRequestException(
        'La obra debe conservar al menos un Administrador',
      );
    }
    await enTransaccion(this.db, u.id, async (m) => {
      await m.query(
        `DELETE FROM obra_miembros WHERE obra_id = $1 AND usuario_id = $2`,
        [id, usuarioId],
      );
      await this.bitacora.registrar(
        {
          obraId: id,
          accion: 'Quitó un miembro del equipo',
          detalle: previo.nombre,
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, id);
  }

  /**
   * Designa a quienes firman la aprobación de la habilitación.
   * Como en el POS: si cambia un firmante, se borran las firmas ya estampadas de la habilitación.
   */
  async designarFirmantes(id: string, dto: FirmantesDto, u: UsuarioSesion) {
    const obra = await this.obtener(u, id);
    exigirEstado(
      obra.estado,
      ['HABILITACION'],
      'cambiar los firmantes de la habilitación',
    );

    const nuevoAdm =
      dto.administradorId !== undefined
        ? dto.administradorId
        : obra.administradorId;
    const nuevoSup =
      dto.superintendenteId !== undefined
        ? dto.superintendenteId
        : obra.superintendenteId;
    if (nuevoAdm && nuevoSup && nuevoAdm === nuevoSup) {
      throw new BadRequestException(
        'El Administrador y el Superintendente deben ser personas distintas',
      );
    }
    const funcionDe = (uid: string) =>
      obra.miembros.find((x: { usuarioId: string }) => x.usuarioId === uid)
        ?.funcion;
    if (nuevoAdm && funcionDe(nuevoAdm) !== 'ADMINISTRADOR') {
      throw new BadRequestException(
        'El firmante Administrador debe ser miembro de la obra con función ADMINISTRADOR',
      );
    }
    if (nuevoSup && funcionDe(nuevoSup) !== 'SUPERINTENDENTE') {
      throw new BadRequestException(
        'El firmante Superintendente debe ser miembro de la obra con función SUPERINTENDENTE',
      );
    }
    if (
      nuevoAdm === obra.administradorId &&
      nuevoSup === obra.superintendenteId
    )
      return obra;

    await enTransaccion(this.db, u.id, async (m) => {
      await m.query(
        `UPDATE obras SET administrador_id = $1, superintendente_id = $2 WHERE id = $3`,
        [nuevoAdm, nuevoSup, id],
      );
      const [{ n: firmadas }] = await m.query(
        `SELECT COUNT(*)::int AS n FROM firmas
          WHERE entidad_tipo = 'HABILITACION' AND entidad_id = $1 AND firmado_en IS NOT NULL`,
        [id],
      );
      await m.query(
        `UPDATE firmas SET firmado_por = NULL, firmado_en = NULL, firma_archivo_id = NULL, nombre_firmante = NULL,
                cargo_firmante = NULL, es_reemplazo = FALSE, motivo = NULL,
                designado_id = CASE rol_firma WHEN 'ADMINISTRADOR' THEN $2::uuid WHEN 'SUPERINTENDENTE' THEN $3::uuid ELSE designado_id END
          WHERE entidad_tipo = 'HABILITACION' AND entidad_id = $1`,
        [id, nuevoAdm, nuevoSup],
      );
      await this.bitacora.registrar(
        {
          obraId: id,
          accion: 'Cambió los firmantes de la habilitación',
          detalle:
            firmadas > 0
              ? `Se reiniciaron ${firmadas} firma(s) de aprobación ya estampadas`
              : undefined,
          cambios: [
            {
              campo: 'Administrador del contrato',
              antes: obra.administradorNombre ?? null,
              despues: nuevoAdm ? this.nombreMiembro(obra, nuevoAdm) : null,
            },
            {
              campo: 'Superintendente de obra',
              antes: obra.superintendenteNombre ?? null,
              despues: nuevoSup ? this.nombreMiembro(obra, nuevoSup) : null,
            },
          ].filter((c) => c.antes !== c.despues),
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, id);
  }

  /** Suspender, reactivar o cerrar. La habilitación → ACTIVA solo ocurre con las firmas (fase 2). */
  async cambiarEstado(id: string, dto: CambiarEstadoDto, u: UsuarioSesion) {
    const obra = await this.obtener(u, id);
    const permitidas: Record<string, string[]> = {
      ACTIVA: ['PAUSADA', 'CERRADA'],
      PAUSADA: ['ACTIVA', 'CERRADA'],
    };
    if (!(permitidas[obra.estado] ?? []).includes(dto.estado)) {
      throw new BadRequestException(
        obra.estado === 'HABILITACION'
          ? 'La obra se activa automáticamente cuando se completan las firmas de habilitación'
          : `No se puede pasar de ${obra.estado} a ${dto.estado}`,
      );
    }
    await enTransaccion(this.db, u.id, async (m) => {
      await m.query(`UPDATE obras SET estado = $1 WHERE id = $2`, [
        dto.estado,
        id,
      ]);
      await this.bitacora.registrar(
        {
          obraId: id,
          accion: {
            ACTIVA: 'Reactivó la obra',
            PAUSADA: 'Suspendió la obra',
            CERRADA: 'Cerró la obra',
          }[dto.estado],
          detalle: dto.motivo,
          cambios: [
            { campo: 'Estado', antes: obra.estado, despues: dto.estado },
          ],
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, id);
  }

  // -------------------------------------------------------------------

  private nombreMiembro(
    obra: { miembros: { usuarioId: string; nombre: string }[] },
    uid: string,
  ) {
    return obra.miembros.find((x) => x.usuarioId === uid)?.nombre ?? uid;
  }

  /** No se puede quitar ni cambiar de función a un firmante designado sin reasignarlo antes. */
  private validarQueNoSeaFirmanteAfectado(
    obra: { administradorId: string | null; superintendenteId: string | null },
    usuarioId: string,
    nuevaFuncion: string | null,
  ) {
    if (
      obra.administradorId === usuarioId &&
      nuevaFuncion !== 'ADMINISTRADOR'
    ) {
      throw new BadRequestException(
        'Es el firmante Administrador de la habilitación: designa a otra persona antes',
      );
    }
    if (
      obra.superintendenteId === usuarioId &&
      nuevaFuncion !== 'SUPERINTENDENTE'
    ) {
      throw new BadRequestException(
        'Es el firmante Superintendente de la habilitación: designa a otra persona antes',
      );
    }
  }
}

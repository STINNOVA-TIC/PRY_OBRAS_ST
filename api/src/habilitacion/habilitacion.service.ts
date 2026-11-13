import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { asegurarAccesoObra, exigirEstado } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { ROL_SUPERADMIN, UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import { FirmasService } from '../firmas/firmas.service.js';
import {
  AgregarContratistaDto,
  DocumentoContratistaDto,
  RequisitoDto,
  RevisionDocumentoDto,
} from './habilitacion.dto.js';

const ETIQUETAS = {
  ADMINISTRADOR: 'Administrador del contrato',
  SUPERINTENDENTE: 'Superintendente de obra',
} as const;
type RolHab = keyof typeof ETIQUETAS;

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

@Injectable()
export class HabilitacionService {
  constructor(
    private readonly db: DataSource,
    private readonly firmas: FirmasService,
    private readonly bitacora: BitacoraService,
  ) {}

  // =================================================================== lectura

  /** Estado completo de la habilitación: requisitos, contratistas con documentos, firmas y progreso. */
  async obtener(u: UsuarioSesion, obraId: string, m?: EntityManager) {
    const db = m ?? this.db;
    await asegurarAccesoObra(db, u, obraId);
    const [obra] = await db.query(
      `SELECT id, nombre, estado, administrador_id AS "administradorId", superintendente_id AS "superintendenteId",
              habilitada_en AS "habilitadaEn" FROM obras WHERE id = $1`,
      [obraId],
    );

    const requisitos = (
      await db.query(
        `SELECT t.id AS "tipoId", t.codigo, t.nombre, t.texto_confirmacion AS "textoConfirmacion",
                t.etiqueta_ref AS "etiquetaRef", t.etiqueta_fecha AS "etiquetaFecha", t.etiqueta_adjunto AS "etiquetaAdjunto",
                t.es_monto AS "esMonto", r.id, r.referencia, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.monto::float AS monto,
                r.archivo_id AS "archivoId", a.nombre_original AS "archivoNombre", COALESCE(r.confirmado, false) AS confirmado,
                r.cargado_en AS "cargadoEn", uc.nombre AS "cargadoPor", r.revisado_en AS "revisadoEn", ur.nombre AS "revisadoPor"
           FROM tipos_requisito t
           LEFT JOIN obra_requisitos r ON r.tipo_id = t.id AND r.obra_id = $1
           LEFT JOIN archivos a ON a.id = r.archivo_id
           LEFT JOIN usuarios uc ON uc.id = r.cargado_por
           LEFT JOIN usuarios ur ON ur.id = r.revisado_por
          WHERE t.activo ORDER BY t.orden`,
        [obraId],
      )
    ).map((r: Record<string, unknown>) => ({
      ...r,
      estado:
        !r.id || !r.confirmado
          ? 'PENDIENTE'
          : !r.archivoId
            ? 'FALTA_ARCHIVO'
            : !r.revisadoEn
              ? 'FALTA_OK'
              : 'OK',
    }));

    const tipos: {
      id: number;
      codigo: string;
      nombre: string;
      vence: boolean;
    }[] = await db.query(
      `SELECT id, codigo, nombre, vence FROM tipos_documento_contratista WHERE activo ORDER BY orden`,
    );
    const ocs = await db.query(
      `SELECT oc.id, oc.contratista_id AS "contratistaId", c.ruc, c.razon_social AS "razonSocial",
              c.nombre_comercial AS "nombreComercial", oc.objeto
         FROM obra_contratistas oc JOIN contratistas c ON c.id = oc.contratista_id
        WHERE oc.obra_id = $1 AND oc.activo ORDER BY oc.created_at`,
      [obraId],
    );
    const docs = await db.query(
      `SELECT d.id, d.obra_contratista_id AS "obraContratistaId", d.tipo_id AS "tipoId", d.version,
              d.archivo_id AS "archivoId", a.nombre_original AS "archivoNombre", to_char(d.vence, 'YYYY-MM-DD') AS vence,
              d.estado, d.observacion, d.cargado_en AS "cargadoEn", uc.nombre AS "cargadoPor",
              d.revisado_en AS "revisadoEn", ur.nombre AS "revisadoPor"
         FROM contratista_documentos d
         JOIN obra_contratistas oc ON oc.id = d.obra_contratista_id AND oc.obra_id = $1
         JOIN archivos a ON a.id = d.archivo_id
         LEFT JOIN usuarios uc ON uc.id = d.cargado_por
         LEFT JOIN usuarios ur ON ur.id = d.revisado_por
        WHERE d.vigente`,
      [obraId],
    );
    const h = hoy();
    const contratistas = ocs.map((oc: { id: string }) => {
      const documentos = tipos.map((t) => {
        const d = docs.find(
          (x: { obraContratistaId: string; tipoId: number }) =>
            x.obraContratistaId === oc.id && x.tipoId === t.id,
        );
        const vencido = !!(d && t.vence && (!d.vence || d.vence < h));
        const estado = !d
          ? 'SIN_ARCHIVO'
          : d.estado === 'APROBADO' && vencido
            ? 'VENCIDO'
            : d.estado;
        return {
          tipoId: t.id,
          codigo: t.codigo,
          nombre: t.nombre,
          requiereVence: t.vence,
          documento: d ?? null,
          estado,
          vigente: estado === 'APROBADO',
        };
      });
      return {
        ...oc,
        documentos,
        completo: documentos.every((d) => d.vigente),
      };
    });

    await this.asegurarFirmas(m ?? null, obra);
    const firmas = await this.firmas.listar(db, 'HABILITACION', obraId);

    const items = [
      ...requisitos.map(
        (r: { codigo: string; nombre: string; estado: string }) => ({
          clave: r.codigo,
          nombre: r.nombre,
          ok: r.estado === 'OK',
        }),
      ),
      {
        clave: 'CONTRATISTAS',
        nombre: 'Documentos de contratistas',
        ok:
          contratistas.length > 0 &&
          contratistas.every((c: { completo: boolean }) => c.completo),
      },
    ];
    const hechos = items.filter((i) => i.ok).length;

    return {
      obra,
      requisitos,
      contratistas,
      firmas,
      progreso: {
        items,
        hechos,
        total: items.length,
        completo: hechos === items.length,
      },
    };
  }

  /** Bandeja: pasos de firma de habilitación asignados al usuario y aún sin firmar. */
  async pendientes(u: UsuarioSesion) {
    const filas: { obraId: string; rol: RolHab }[] = await this.db.query(
      `SELECT o.id AS "obraId", f.rol_firma AS rol
         FROM firmas f JOIN obras o ON o.id = f.entidad_id
        WHERE f.entidad_tipo = 'HABILITACION' AND f.designado_id = $1 AND f.firmado_en IS NULL
          AND o.estado = 'HABILITACION' AND o.eliminado_en IS NULL`,
      [u.id],
    );
    const out = [];
    for (const f of filas) {
      const hab = await this.obtener(u, f.obraId);
      out.push({
        tipo: 'HABILITACION',
        obraId: f.obraId,
        obraNombre: hab.obra.nombre,
        rol: f.rol,
        etiqueta: ETIQUETAS[f.rol],
        listo: hab.progreso.completo,
        progreso: `${hab.progreso.hechos}/${hab.progreso.total}`,
      });
    }
    return out;
  }

  // =================================================================== requisitos

  async guardarRequisito(
    u: UsuarioSesion,
    obraId: string,
    codigo: string,
    dto: RequisitoDto,
  ) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['HABILITACION'], 'modificar los requisitos');
    const tipo = await this.tipoRequisito(codigo);
    if (dto.monto != null && !tipo.es_monto)
      throw new BadRequestException('Este requisito no lleva monto');
    if (dto.archivoId) await this.validarArchivo(dto.archivoId);

    await enTransaccion(this.db, u.id, async (m) => {
      const [previo] = await m.query(
        `SELECT * FROM obra_requisitos WHERE obra_id = $1 AND tipo_id = $2`,
        [obraId, tipo.id],
      );
      const valores = {
        referencia:
          dto.referencia !== undefined
            ? dto.referencia
            : (previo?.referencia ?? null),
        fecha: dto.fecha !== undefined ? dto.fecha : (previo?.fecha ?? null),
        monto: dto.monto !== undefined ? dto.monto : (previo?.monto ?? null),
        archivo_id:
          dto.archivoId !== undefined
            ? dto.archivoId
            : (previo?.archivo_id ?? null),
        confirmado: dto.confirmado ?? previo?.confirmado ?? false,
      };
      // Cualquier cambio invalida el OK de revisión (hay que volver a revisarlo)
      await m.query(
        `INSERT INTO obra_requisitos (obra_id, tipo_id, referencia, fecha, monto, archivo_id, confirmado, cargado_por, cargado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         ON CONFLICT (obra_id, tipo_id) DO UPDATE SET referencia = EXCLUDED.referencia, fecha = EXCLUDED.fecha,
           monto = EXCLUDED.monto, archivo_id = EXCLUDED.archivo_id, confirmado = EXCLUDED.confirmado,
           cargado_por = EXCLUDED.cargado_por, cargado_en = now(), revisado_por = NULL, revisado_en = NULL`,
        [
          obraId,
          tipo.id,
          valores.referencia,
          valores.fecha,
          valores.monto,
          valores.archivo_id,
          valores.confirmado,
          u.id,
        ],
      );
      const reiniciadas = await this.firmas.reiniciar(
        m,
        'HABILITACION',
        obraId,
      );
      await this.bitacora.registrar(
        {
          obraId,
          accion: previo
            ? 'Actualizó un requisito de habilitación'
            : 'Cargó un requisito de habilitación',
          detalle:
            tipo.nombre +
            (reiniciadas
              ? `. Se reiniciaron ${reiniciadas} firma(s) de aprobación`
              : ''),
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, obraId);
  }

  async revisarRequisito(
    u: UsuarioSesion,
    obraId: string,
    codigo: string,
    ok: boolean,
  ) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['HABILITACION'], 'revisar los requisitos');
    const tipo = await this.tipoRequisito(codigo);
    await enTransaccion(this.db, u.id, async (m) => {
      const [r] = await m.query(
        `SELECT * FROM obra_requisitos WHERE obra_id = $1 AND tipo_id = $2 FOR UPDATE`,
        [obraId, tipo.id],
      );
      if (!r)
        throw new BadRequestException('El requisito aún no se ha cargado');
      if (ok) {
        if (!r.confirmado)
          throw new BadRequestException('Falta la confirmación del requisito');
        if (!r.archivo_id)
          throw new BadRequestException(
            'Falta el archivo adjunto del requisito',
          );
        if (r.revisado_en)
          throw new ConflictException('El requisito ya tiene OK');
      } else if (!r.revisado_en) {
        throw new BadRequestException('El requisito no tiene OK');
      }
      await m.query(
        `UPDATE obra_requisitos SET revisado_por = $1, revisado_en = $2 WHERE id = $3`,
        [ok ? u.id : null, ok ? new Date() : null, r.id],
      );
      const reiniciadas = ok
        ? 0
        : await this.firmas.reiniciar(m, 'HABILITACION', obraId);
      await this.bitacora.registrar(
        {
          obraId,
          accion: ok ? 'Dio OK a un requisito' : 'Quitó el OK de un requisito',
          detalle:
            tipo.nombre +
            (reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''),
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, obraId);
  }

  // =================================================================== contratistas

  async agregarContratista(
    u: UsuarioSesion,
    obraId: string,
    dto: AgregarContratistaDto,
  ) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(
      estado,
      ['HABILITACION', 'ACTIVA', 'PAUSADA'],
      'agregar contratistas',
    );
    const [c] = await this.db.query(
      `SELECT razon_social, activo FROM contratistas WHERE id = $1`,
      [dto.contratistaId],
    );
    if (!c) throw new NotFoundException('Contratista no encontrado');
    if (!c.activo)
      throw new BadRequestException('El contratista está desactivado');

    await enTransaccion(this.db, u.id, async (m) => {
      const [previo] = await m.query(
        `SELECT id, activo FROM obra_contratistas WHERE obra_id = $1 AND contratista_id = $2`,
        [obraId, dto.contratistaId],
      );
      if (previo?.activo)
        throw new ConflictException('El contratista ya está en la obra');
      if (previo) {
        await m.query(
          `UPDATE obra_contratistas SET activo = TRUE, objeto = COALESCE($2, objeto) WHERE id = $1`,
          [previo.id, dto.objeto ?? null],
        );
      } else {
        await m.query(
          `INSERT INTO obra_contratistas (obra_id, contratista_id, objeto) VALUES ($1, $2, $3)`,
          [obraId, dto.contratistaId, dto.objeto ?? null],
        );
      }
      // Un contratista nuevo sin documentos deja la habilitación incompleta
      const reiniciadas =
        estado === 'HABILITACION'
          ? await this.firmas.reiniciar(m, 'HABILITACION', obraId)
          : 0;
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Agregó un contratista a la obra',
          detalle:
            c.razon_social +
            (reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''),
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, obraId);
  }

  async quitarContratista(
    u: UsuarioSesion,
    obraId: string,
    obraContratistaId: string,
  ) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(
      estado,
      ['HABILITACION', 'ACTIVA', 'PAUSADA'],
      'quitar contratistas',
    );
    const oc = await this.obraContratista(obraId, obraContratistaId);
    const [{ n }] = await this.db.query(
      `SELECT (SELECT COUNT(*) FROM avances WHERE obra_contratista_id = $1) + (SELECT COUNT(*) FROM planillas WHERE obra_contratista_id = $1) AS n`,
      [obraContratistaId],
    );
    if (Number(n) > 0)
      throw new ConflictException(
        'El contratista tiene avances o planillas en esta obra: no se puede quitar',
      );
    await enTransaccion(this.db, u.id, async (m) => {
      await m.query(
        `UPDATE obra_contratistas SET activo = FALSE WHERE id = $1`,
        [obraContratistaId],
      );
      const reiniciadas =
        estado === 'HABILITACION'
          ? await this.firmas.reiniciar(m, 'HABILITACION', obraId)
          : 0;
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Quitó un contratista de la obra',
          detalle:
            oc.razon_social +
            (reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''),
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, obraId);
  }

  /** Sube una nueva versión de un documento habilitante (queda PENDIENTE de revisión SIG). */
  async subirDocumento(
    u: UsuarioSesion,
    obraId: string,
    obraContratistaId: string,
    codigo: string,
    dto: DocumentoContratistaDto,
  ) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(
      estado,
      ['HABILITACION', 'ACTIVA', 'PAUSADA'],
      'cargar documentos',
    );
    const oc = await this.obraContratista(obraId, obraContratistaId);
    const [tipo] = await this.db.query(
      `SELECT id, nombre, vence FROM tipos_documento_contratista WHERE codigo = $1 AND activo`,
      [codigo.toUpperCase()],
    );
    if (!tipo) throw new NotFoundException('Tipo de documento no encontrado');
    if (tipo.vence && !dto.vence)
      throw new BadRequestException(
        `«${tipo.nombre}» requiere fecha de vencimiento`,
      );
    if (!tipo.vence && dto.vence)
      throw new BadRequestException(
        `«${tipo.nombre}» no lleva fecha de vencimiento`,
      );
    if (dto.vence && dto.vence < hoy())
      throw new BadRequestException('El documento ya está vencido');
    await this.validarArchivo(dto.archivoId);

    await enTransaccion(this.db, u.id, async (m) => {
      const [{ v }] = await m.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM contratista_documentos WHERE obra_contratista_id = $1 AND tipo_id = $2`,
        [obraContratistaId, tipo.id],
      );
      await m.query(
        `INSERT INTO contratista_documentos (obra_contratista_id, tipo_id, version, archivo_id, vence, cargado_por)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [obraContratistaId, tipo.id, v, dto.archivoId, dto.vence ?? null, u.id],
      );
      const reiniciadas =
        estado === 'HABILITACION'
          ? await this.firmas.reiniciar(m, 'HABILITACION', obraId)
          : 0;
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Cargó un documento de contratista',
          detalle:
            `${oc.razon_social}: ${tipo.nombre} (versión ${v})` +
            (reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''),
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, obraId);
  }

  /** Revisión SIG de un documento: APROBADO o RECHAZADO (con observación). */
  async revisarDocumento(
    u: UsuarioSesion,
    obraId: string,
    documentoId: string,
    dto: RevisionDocumentoDto,
  ) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(
      estado,
      ['HABILITACION', 'ACTIVA', 'PAUSADA'],
      'revisar documentos',
    );
    if (dto.estado === 'RECHAZADO' && !dto.observacion)
      throw new BadRequestException('Indica el motivo del rechazo');
    await enTransaccion(this.db, u.id, async (m) => {
      const [d] = await m.query(
        `SELECT d.id, d.estado, d.vigente, t.nombre AS tipo, c.razon_social
           FROM contratista_documentos d
           JOIN obra_contratistas oc ON oc.id = d.obra_contratista_id AND oc.obra_id = $2
           JOIN contratistas c ON c.id = oc.contratista_id
           JOIN tipos_documento_contratista t ON t.id = d.tipo_id
          WHERE d.id = $1 FOR UPDATE OF d`,
        [documentoId, obraId],
      );
      if (!d) throw new NotFoundException('Documento no encontrado');
      if (!d.vigente)
        throw new BadRequestException(
          'Es una versión anterior: revisa la versión vigente',
        );
      if (d.estado === dto.estado)
        throw new ConflictException(
          `El documento ya está ${dto.estado.toLowerCase()}`,
        );
      await m.query(
        `UPDATE contratista_documentos SET estado = $1, observacion = $2, revisado_por = $3, revisado_en = now() WHERE id = $4`,
        [dto.estado, dto.observacion ?? null, u.id, documentoId],
      );
      const reiniciadas =
        dto.estado === 'RECHAZADO' && estado === 'HABILITACION'
          ? await this.firmas.reiniciar(m, 'HABILITACION', obraId)
          : 0;
      await this.bitacora.registrar(
        {
          obraId,
          accion:
            dto.estado === 'APROBADO'
              ? 'Aprobó un documento de contratista'
              : 'Rechazó un documento de contratista',
          detalle:
            `${d.razon_social}: ${d.tipo}${dto.observacion ? ` — ${dto.observacion}` : ''}` +
            (reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''),
          cambios: [{ campo: 'Estado', antes: d.estado, despues: dto.estado }],
          usuarioId: u.id,
        },
        m,
      );
    });
    return this.obtener(u, obraId);
  }

  // =================================================================== firmas

  /**
   * Firma de aprobación (como firmar el requerimiento en el POS).
   * Requisitos: obra en habilitación, todo completo, ser el designado y tener firma registrada.
   * Al completarse las dos firmas la obra pasa a ACTIVA.
   */
  async firmar(u: UsuarioSesion, obraId: string, rol?: RolHab) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const hab = await this.bloquearYValidar(m, u, obraId);
      const r: RolHab | undefined =
        rol ??
        (hab.obra.administradorId === u.id
          ? 'ADMINISTRADOR'
          : hab.obra.superintendenteId === u.id
            ? 'SUPERINTENDENTE'
            : undefined);
      if (!r)
        throw new ForbiddenException(
          'No estás designado como firmante de esta habilitación',
        );
      const firmas = await this.firmas.firmar(m, 'HABILITACION', obraId, r, u);
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Firmó la aprobación de habilitación',
          detalle: ETIQUETAS[r],
          usuarioId: u.id,
        },
        m,
      );
      await this.activarSiCompleta(m, obraId, firmas, u);
    });
    return this.obtener(u, obraId);
  }

  /** El propietario firma en reemplazo del superintendente (p. ej. está de descanso), con motivo. */
  async firmarReemplazo(u: UsuarioSesion, obraId: string, motivo: string) {
    if (
      !u.roles.includes(ROL_SUPERADMIN) &&
      !u.permisos.includes('habilitacion.reemplazo')
    ) {
      throw new ForbiddenException(
        'No tienes permiso para firmar en reemplazo',
      );
    }
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      await this.bloquearYValidar(m, u, obraId);
      const firmas = await this.firmas.firmar(
        m,
        'HABILITACION',
        obraId,
        'SUPERINTENDENTE',
        u,
        { motivo },
      );
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Firmó en reemplazo del superintendente',
          detalle: motivo,
          usuarioId: u.id,
        },
        m,
      );
      await this.activarSiCompleta(m, obraId, firmas, u);
    });
    return this.obtener(u, obraId);
  }

  // =================================================================== auxiliares

  private async bloquearYValidar(
    m: EntityManager,
    u: UsuarioSesion,
    obraId: string,
  ) {
    await m.query(`SELECT id FROM obras WHERE id = $1 FOR UPDATE`, [obraId]); // evita dos activaciones simultáneas
    const hab = await this.obtener(u, obraId, m);
    exigirEstado(hab.obra.estado, ['HABILITACION'], 'firmar la habilitación');
    if (!hab.progreso.completo) {
      const faltan = hab.progreso.items
        .filter((i) => !i.ok)
        .map((i) => i.nombre)
        .join(', ');
      throw new BadRequestException(
        `La habilitación no está completa. Falta: ${faltan}`,
      );
    }
    return hab;
  }

  private async activarSiCompleta(
    m: EntityManager,
    obraId: string,
    firmas: { firmado: boolean }[],
    u: UsuarioSesion,
  ) {
    if (firmas.length === 2 && firmas.every((f) => f.firmado)) {
      await m.query(
        `UPDATE obras SET estado = 'ACTIVA', habilitada_en = now() WHERE id = $1`,
        [obraId],
      );
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Habilitó la obra',
          detalle: 'Firmas completas: la obra pasa a En ejecución',
          cambios: [
            { campo: 'Estado', antes: 'HABILITACION', despues: 'ACTIVA' },
          ],
          usuarioId: u.id,
        },
        m,
      );
    }
  }

  /** Los dos pasos de firma existen siempre, con el designado actual de la obra. */
  private async asegurarFirmas(
    m: EntityManager | null,
    obra: {
      id: string;
      estado: string;
      administradorId: string | null;
      superintendenteId: string | null;
    },
  ) {
    if (obra.estado !== 'HABILITACION') return;
    const pasos = [
      {
        rol: 'ADMINISTRADOR',
        etiqueta: ETIQUETAS.ADMINISTRADOR,
        orden: 1,
        designadoId: obra.administradorId,
      },
      {
        rol: 'SUPERINTENDENTE',
        etiqueta: ETIQUETAS.SUPERINTENDENTE,
        orden: 2,
        designadoId: obra.superintendenteId,
      },
    ];
    if (m) await this.firmas.asegurar(m, 'HABILITACION', obra.id, pasos);
    else
      await this.db.transaction((t) =>
        this.firmas.asegurar(t, 'HABILITACION', obra.id, pasos),
      );
  }

  private async tipoRequisito(codigo: string) {
    const [t] = await this.db.query(
      `SELECT id, nombre, es_monto FROM tipos_requisito WHERE codigo = $1 AND activo`,
      [codigo.toUpperCase()],
    );
    if (!t) throw new NotFoundException('Requisito no encontrado');
    return t;
  }

  private async obraContratista(obraId: string, id: string) {
    const [oc] = await this.db.query(
      `SELECT oc.id, c.razon_social FROM obra_contratistas oc JOIN contratistas c ON c.id = oc.contratista_id
        WHERE oc.id = $1 AND oc.obra_id = $2 AND oc.activo`,
      [id, obraId],
    );
    if (!oc) throw new NotFoundException('El contratista no está en esta obra');
    return oc;
  }

  private async validarArchivo(id: string) {
    const [a] = await this.db.query(
      `SELECT categoria FROM archivos WHERE id = $1`,
      [id],
    );
    if (!a) throw new BadRequestException('El archivo adjunto no existe');
    if (a.categoria === 'FIRMA')
      throw new BadRequestException(
        'No se puede adjuntar una firma como documento',
      );
  }
}

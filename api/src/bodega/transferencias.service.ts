import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { veTodas } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { ROL_SUPERADMIN, type UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import { FirmasService } from '../firmas/firmas.service.js';
import { asegurarAccesoObra } from '../common/acceso-obra.js';
import { asegurarAccesoBodega, infoBodega, operaCentral, type BodegaInfo } from './bodega.service.js';
import type {
  AnularTransferenciaDto,
  DespacharDto,
  ItemMovimientoTransferenciaDto,
  RechazarTransferenciaDto,
  ListarTransferenciasDto,
  RecibirDto,
  SolicitarTransferenciaDto,
} from './bodega.dto.js';

/** Pasos de firma de una transferencia (patrón del Punto de Venta: solicitud → aprobación → despacho → recepción). */
const PASOS = {
  SOLICITADO: { etiqueta: 'Solicitado por', orden: 1 },
  APROBADO: { etiqueta: 'Aprobado por', orden: 2 },
  DESPACHADO: { etiqueta: 'Despachado por', orden: 3 },
  RECIBIDO: { etiqueta: 'Recibido por', orden: 4 },
} as const;

/** Quien solicita puede también recibir (el residente pide y recibe en su obra); el resto, una persona por paso. */
const COMPATIBLES: Record<string, string[]> = { RECIBIDO: ['SOLICITADO'], DESPACHADO: [] };

const tiene = (u: UsuarioSesion, p: string) => u.roles.includes(ROL_SUPERADMIN) || u.permisos.includes(p);

interface Cabecera {
  id: string;
  numero: number;
  estado: string;
  bodegaOrigenId: number;
  bodegaDestinoId: number;
  creadoPor: string;
}

@Injectable()
export class TransferenciasService {
  constructor(
    private readonly db: DataSource,
    private readonly firmas: FirmasService,
    private readonly bitacora: BitacoraService,
  ) {}

  /** Transferencias de las bodegas que el usuario ve (filtrables por bodega y estado). */
  async listar(u: UsuarioSesion, f: ListarTransferenciasDto) {
    const params: unknown[] = [u.id];
    const where: string[] = [];
    if (!veTodas(u))
      where.push(`(EXISTS (SELECT 1 FROM obra_miembros m JOIN bodegas b ON b.obra_id = m.obra_id
                           WHERE m.usuario_id = $1 AND b.id IN (t.bodega_origen_id, t.bodega_destino_id))
                  OR (${operaCentral(u) ? 'TRUE' : 'FALSE'} AND (bo.tipo = 'CENTRAL' OR bd.tipo = 'CENTRAL')))`);
    if (f.bodegaId) {
      await asegurarAccesoBodega(this.db, u, f.bodegaId);
      params.push(f.bodegaId);
      where.push(`$${params.length} IN (t.bodega_origen_id, t.bodega_destino_id)`);
    }
    if (f.estado === 'ABIERTAS') where.push(`t.estado IN ('SOLICITADA','APROBADA','DESPACHADA')`);
    else if (f.estado) {
      params.push(f.estado);
      where.push(`t.estado = $${params.length}`);
    }
    return this.db.query(
      `SELECT t.id, t.numero::int, t.estado, t.motivo, t.created_at AS "creadoEn", t.updated_at AS "actualizadoEn",
              t.bodega_origen_id AS "bodegaOrigenId", ${nombreBodega('bo', 'oo')} AS "origenNombre",
              t.bodega_destino_id AS "bodegaDestinoId", ${nombreBodega('bd', 'od')} AS "destinoNombre",
              uc.nombre AS "creadoPorNombre",
              (SELECT COUNT(*)::int FROM transferencia_items i WHERE i.transferencia_id = t.id) AS items,
              (SELECT string_agg(m.nombre, ', ' ORDER BY m.codigo) FROM transferencia_items i JOIN materiales m ON m.id = i.material_id
                WHERE i.transferencia_id = t.id) AS materiales,
              (SELECT f.etiqueta || ': ' || COALESCE(d.nombre, 'quien despache o reciba') FROM firmas f LEFT JOIN usuarios d ON d.id = f.designado_id
                WHERE f.entidad_tipo = 'TRANSFERENCIA' AND f.entidad_id = t.id AND f.firmado_en IS NULL ORDER BY f.orden LIMIT 1) AS "siguientePaso"
         FROM transferencias t
         JOIN bodegas bo ON bo.id = t.bodega_origen_id LEFT JOIN obras oo ON oo.id = bo.obra_id
         JOIN bodegas bd ON bd.id = t.bodega_destino_id LEFT JOIN obras od ON od.id = bd.obra_id
         JOIN usuarios uc ON uc.id = t.creado_por
        WHERE $1::uuid IS NOT NULL ${where.length ? 'AND ' + where.join(' AND ') : ''}
        ORDER BY t.created_at DESC
        LIMIT ${f.limit ?? 100}`,
      params,
    );
  }

  /** Detalle con ítems, firmas, movimientos generados y qué puede hacer el usuario ahora. */
  async obtener(u: UsuarioSesion, id: string, db: DataSource | EntityManager = this.db) {
    const t = await this.cabecera(db, id);
    const [origen, destino] = await this.accesos(db, u, t);
    const [det] = await db.query(
      `SELECT t.id, t.numero::int, t.estado, t.motivo, t.documento_ref AS "documentoRef", t.nota_recepcion AS "notaRecepcion",
              t.created_at AS "creadoEn", t.creado_por AS "creadoPor", uc.nombre AS "creadoPorNombre",
              t.anulado_en AS "anuladoEn", ua.nombre AS "anuladoPorNombre", t.motivo_anulacion AS "motivoAnulacion",
              t.rechazado_en AS "rechazadoEn", ur.nombre AS "rechazadoPorNombre", t.motivo_rechazo AS "motivoRechazo"
         FROM transferencias t JOIN usuarios uc ON uc.id = t.creado_por LEFT JOIN usuarios ua ON ua.id = t.anulado_por
         LEFT JOIN usuarios ur ON ur.id = t.rechazado_por
        WHERE t.id = $1`,
      [id],
    );
    const items = await db.query(
      `SELECT i.material_id AS "materialId", m.codigo, m.nombre, m.unidad,
              i.cantidad_solicitada::float AS solicitada, i.cantidad_despachada::float AS despachada,
              i.cantidad_recibida::float AS recibida,
              i.nota_despacho AS "notaDespacho", i.archivo_despacho_id AS "archivoDespachoId", ad.nombre_original AS "archivoDespachoNombre",
              i.nota_recepcion AS "notaRecepcion", i.archivo_recepcion_id AS "archivoRecepcionId", ar.nombre_original AS "archivoRecepcionNombre",
              COALESCE((SELECT s.cantidad FROM stock s WHERE s.bodega_id = $2 AND s.material_id = i.material_id), 0)::float AS "stockOrigen"
         FROM transferencia_items i JOIN materiales m ON m.id = i.material_id
         LEFT JOIN archivos ad ON ad.id = i.archivo_despacho_id LEFT JOIN archivos ar ON ar.id = i.archivo_recepcion_id
        WHERE i.transferencia_id = $1 ORDER BY m.codigo`,
      [id, t.bodegaOrigenId],
    );
    const firmas = await this.firmas.listar(db, 'TRANSFERENCIA', id);
    const yaFirme = firmas.some((f) => f.firmadoPor === u.id);
    const firmeAlgoMasQueSolicitar = firmas.some((f) => f.firmadoPor === u.id && f.rol !== 'SOLICITADO');
    const aprob = firmas.find((f) => f.rol === 'APROBADO');
    const puede = {
      aprobar: t.estado === 'SOLICITADA' && aprob?.designadoId === u.id && tiene(u, 'bodega.firmar_transferencia'),
      despachar: t.estado === 'APROBADA' && tiene(u, 'bodega.firmar_transferencia') && !yaFirme && this.operaEn(origen),
      rechazar: t.estado === 'APROBADA' && tiene(u, 'bodega.firmar_transferencia') && this.operaEn(origen),
      recibir: t.estado === 'DESPACHADA' && tiene(u, 'bodega.firmar_transferencia') && !firmeAlgoMasQueSolicitar && this.operaEn(destino),
      anular:
        ['SOLICITADA', 'APROBADA'].includes(t.estado) &&
        (t.creadoPor === u.id || aprob?.designadoId === u.id || tiene(u, 'bodega.ajustar')),
    };
    return { ...det, origen, destino, items, firmas, puede };
  }

  async solicitar(u: UsuarioSesion, dto: SolicitarTransferenciaDto) {
    if (dto.bodegaOrigenId === dto.bodegaDestinoId) throw new BadRequestException('El origen y el destino deben ser distintos');
    const ids = dto.items.map((i) => i.materialId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay materiales repetidos');
    if (dto.items.some((i) => i.cantidad <= 0)) throw new BadRequestException('Las cantidades deben ser mayores que 0');
    const id = await enTransaccion(this.db, u.id, async (m) => {
      // Cada bodega de obra exige ser del equipo; la central no (un residente puede pedirle material)
      const origen = await infoBodega(m, dto.bodegaOrigenId);
      const destino = await infoBodega(m, dto.bodegaDestinoId);
      for (const b of [origen, destino]) if (b.tipo === 'OBRA') await asegurarAccesoObra(m, u, b.obraId!);
      if (origen.tipo === 'CENTRAL' && destino.tipo === 'CENTRAL') throw new BadRequestException('Origen y destino no pueden ser ambos la central');
      for (const b of [origen, destino])
        if (b.tipo === 'OBRA' && b.obraEstado === 'CERRADA') throw new ForbiddenException(`${b.nombre}: la obra está cerrada`);
      const ok: { id: number }[] = await m.query(`SELECT id FROM materiales WHERE id = ANY($1) AND activo`, [ids]);
      if (ok.length !== ids.length) throw new BadRequestException('Hay materiales no válidos');

      // Aprueba el Administrador de la obra que entrega el material (o la que lo recibe si sale de la central);
      // si es quien solicita, aprueba el Superintendente.
      const obraAprueba = origen.tipo === 'OBRA' ? origen.obraId : destino.obraId;
      let aprobador: string | null = null;
      if (obraAprueba) {
        const [o] = await m.query(`SELECT administrador_id AS a, superintendente_id AS s FROM obras WHERE id = $1`, [obraAprueba]);
        aprobador = o.a && o.a !== u.id ? o.a : o.s && o.s !== u.id ? o.s : null;
      }
      if (!aprobador)
        throw new BadRequestException('La obra no tiene un Administrador o Superintendente designado (distinto de ti) que apruebe la transferencia');

      const [{ id, numero }] = await m.query(
        `INSERT INTO transferencias (bodega_origen_id, bodega_destino_id, motivo, creado_por) VALUES ($1, $2, $3, $4) RETURNING id, numero::int`,
        [dto.bodegaOrigenId, dto.bodegaDestinoId, dto.motivo?.trim() || null, u.id],
      );
      for (const i of dto.items)
        await m.query(
          `INSERT INTO transferencia_items (transferencia_id, material_id, cantidad_solicitada) VALUES ($1, $2, $3)`,
          [id, i.materialId, i.cantidad],
        );
      await this.firmas.asegurar(m, 'TRANSFERENCIA', id, [
        { rol: 'SOLICITADO', ...PASOS.SOLICITADO, designadoId: u.id },
        { rol: 'APROBADO', ...PASOS.APROBADO, designadoId: aprobador },
        { rol: 'DESPACHADO', ...PASOS.DESPACHADO, designadoId: null },
        { rol: 'RECIBIDO', ...PASOS.RECIBIDO, designadoId: null },
      ]);
      // Quien solicita firma al crear (exige su firma registrada, como en el POS)
      await this.firmas.firmar(m, 'TRANSFERENCIA', id, 'SOLICITADO', u);
      await this.registrarBitacora(m, u, origen, destino, `Solicitó la transferencia N.º ${numero}`, dto.motivo ?? undefined);
      return id as string;
    });
    return this.obtener(u, id);
  }

  async aprobar(u: UsuarioSesion, id: string) {
    await enTransaccion(this.db, u.id, async (m) => {
      const t = await this.cabecera(m, id, true);
      const [origen, destino] = await this.accesos(m, u, t);
      this.exigirEstado(t, 'SOLICITADA', 'aprobar');
      await this.firmas.firmar(m, 'TRANSFERENCIA', id, 'APROBADO', u);
      await m.query(`UPDATE transferencias SET estado = 'APROBADA' WHERE id = $1`, [id]);
      await this.registrarBitacora(m, u, origen, destino, `Aprobó la transferencia N.º ${t.numero}`);
    });
    return this.obtener(u, id);
  }

  /** Sale el material de la bodega de origen (TRANSFERENCIA_SALIDA). El stock se valida en la base. */
  async despachar(u: UsuarioSesion, id: string, dto: DespacharDto) {
    await enTransaccion(this.db, u.id, async (m) => {
      const t = await this.cabecera(m, id, true);
      const [origen, destino] = await this.accesos(m, u, t);
      this.exigirEstado(t, 'APROBADA', 'despachar');
      if (!this.operaEn(origen)) throw new ForbiddenException('No tienes acceso a la bodega de origen');
      const items = await this.itemsConCantidad(m, id, dto.items, 'solicitada', u);
      if (!items.some((i) => i.cantidad > 0)) throw new BadRequestException('Despacha al menos un material');
      await this.designarYFirmar(m, id, 'DESPACHADO', u);
      for (const i of items) {
        await m.query(
          `UPDATE transferencia_items SET cantidad_despachada = $3, nota_despacho = $4, archivo_despacho_id = $5
            WHERE transferencia_id = $1 AND material_id = $2`,
          [id, i.materialId, i.cantidad, i.nota, i.archivoId],
        );
        if (i.cantidad > 0)
          await m.query(
            `INSERT INTO movimientos_inventario (bodega_id, material_id, tipo, cantidad, fecha, documento_ref, transferencia_id, nota, usuario_id)
             VALUES ($1, $2, 'TRANSFERENCIA_SALIDA', $3, (now() AT TIME ZONE 'America/Guayaquil')::date, $4, $5, $6, $7)`,
            [t.bodegaOrigenId, i.materialId, -i.cantidad, dto.documentoRef?.trim() || null, id, `Hacia ${destino.nombre}`, u.id],
          );
      }
      await m.query(`UPDATE transferencias SET estado = 'DESPACHADA', documento_ref = $2 WHERE id = $1`, [id, dto.documentoRef?.trim() || null]);
      await this.registrarBitacora(m, u, origen, destino, `Despachó la transferencia N.º ${t.numero}`);
    });
    return this.obtener(u, id);
  }

  /** Entra el material a la bodega de destino (TRANSFERENCIA_ENTRADA). Si llega menos, la nota es obligatoria. */
  async recibir(u: UsuarioSesion, id: string, dto: RecibirDto) {
    await enTransaccion(this.db, u.id, async (m) => {
      const t = await this.cabecera(m, id, true);
      const [origen, destino] = await this.accesos(m, u, t);
      this.exigirEstado(t, 'DESPACHADA', 'recibir');
      if (!this.operaEn(destino)) throw new ForbiddenException('No tienes acceso a la bodega de destino');
      const items = await this.itemsConCantidad(m, id, dto.items, 'despachada', u);
      const faltantes = items.filter((i) => i.cantidad < i.tope - 1e-9);
      const faltante = faltantes.length > 0;
      // Si llegó menos, se explica en la nota general o en la observación de cada material con faltante
      if (faltante && !dto.nota?.trim() && faltantes.some((i) => !i.nota))
        throw new BadRequestException(
          `Llegó menos de lo despachado (${faltantes.map((i) => i.nombre).join(', ')}): explica la novedad en la nota de recepción o en la observación del material`,
        );
      await this.designarYFirmar(m, id, 'RECIBIDO', u);
      for (const i of items) {
        await m.query(
          `UPDATE transferencia_items SET cantidad_recibida = $3, nota_recepcion = $4, archivo_recepcion_id = $5
            WHERE transferencia_id = $1 AND material_id = $2`,
          [id, i.materialId, i.cantidad, i.nota, i.archivoId],
        );
        if (i.cantidad > 0)
          await m.query(
            `INSERT INTO movimientos_inventario (bodega_id, material_id, tipo, cantidad, fecha, transferencia_id, nota, usuario_id)
             VALUES ($1, $2, 'TRANSFERENCIA_ENTRADA', $3, (now() AT TIME ZONE 'America/Guayaquil')::date, $4, $5, $6)`,
            [t.bodegaDestinoId, i.materialId, i.cantidad, id, `Desde ${origen.nombre}`, u.id],
          );
      }
      await m.query(`UPDATE transferencias SET estado = 'RECIBIDA', nota_recepcion = $2 WHERE id = $1`, [id, dto.nota?.trim() || null]);
      await this.registrarBitacora(m, u, origen, destino, `Recibió la transferencia N.º ${t.numero}${faltante ? ' con faltantes' : ''}`, dto.nota ?? undefined);
    });
    return this.obtener(u, id);
  }

  /**
   * Bodega rechaza por falta de stock (en vez de despachar): no se mueve nada y la transferencia queda RECHAZADA.
   * Cada material puede llevar su observación y una foto o documento.
   */
  async rechazar(u: UsuarioSesion, id: string, dto: RechazarTransferenciaDto) {
    await enTransaccion(this.db, u.id, async (m) => {
      const t = await this.cabecera(m, id, true);
      const [origen, destino] = await this.accesos(m, u, t);
      this.exigirEstado(t, 'APROBADA', 'rechazar');
      if (!tiene(u, 'bodega.firmar_transferencia')) throw new ForbiddenException('No tienes permiso para despachar transferencias');
      if (!this.operaEn(origen)) throw new ForbiddenException('No tienes acceso a la bodega de origen');
      const filas: { materialId: number; nombre: string }[] = await m.query(
        `SELECT i.material_id AS "materialId", mt.nombre FROM transferencia_items i JOIN materiales mt ON mt.id = i.material_id WHERE i.transferencia_id = $1`,
        [id],
      );
      for (const x of dto.items ?? []) {
        if (!filas.some((f) => f.materialId === x.materialId)) throw new BadRequestException('Hay materiales que no están en la transferencia');
        const archivoId = await this.validarArchivo(m, x.archivoId, u);
        await m.query(
          `UPDATE transferencia_items SET nota_despacho = $3, archivo_despacho_id = $4 WHERE transferencia_id = $1 AND material_id = $2`,
          [id, x.materialId, x.nota?.trim() || null, archivoId],
        );
      }
      await m.query(
        `UPDATE transferencias SET estado = 'RECHAZADA', rechazado_en = now(), rechazado_por = $2, motivo_rechazo = $3 WHERE id = $1`,
        [id, u.id, dto.motivo.trim()],
      );
      await this.registrarBitacora(m, u, origen, destino, `Rechazó la transferencia N.º ${t.numero} por falta de stock`, dto.motivo);
    });
    return this.obtener(u, id);
  }

  /** Solo antes del despacho (aún no se movió stock). Rechazar = anular por el aprobador. */
  async anular(u: UsuarioSesion, id: string, dto: AnularTransferenciaDto) {
    await enTransaccion(this.db, u.id, async (m) => {
      const t = await this.cabecera(m, id, true);
      const [origen, destino] = await this.accesos(m, u, t);
      if (!['SOLICITADA', 'APROBADA'].includes(t.estado))
        throw new ConflictException(
          t.estado === 'ANULADA' ? 'La transferencia ya está anulada' : 'Ya se despachó: no se puede anular. Registra una transferencia de regreso.',
        );
      const [aprob] = await m.query(
        `SELECT designado_id FROM firmas WHERE entidad_tipo = 'TRANSFERENCIA' AND entidad_id = $1 AND rol_firma = 'APROBADO'`,
        [id],
      );
      if (t.creadoPor !== u.id && aprob?.designado_id !== u.id && !tiene(u, 'bodega.ajustar'))
        throw new ForbiddenException('Solo quien la solicitó, quien la aprueba o un usuario con permiso de ajuste puede anularla');
      await m.query(
        `UPDATE transferencias SET estado = 'ANULADA', anulado_en = now(), anulado_por = $2, motivo_anulacion = $3 WHERE id = $1`,
        [id, u.id, dto.motivo.trim()],
      );
      await this.registrarBitacora(m, u, origen, destino, `Anuló la transferencia N.º ${t.numero}`, dto.motivo);
    });
    return this.obtener(u, id);
  }

  /** Bandeja: aprobaciones designadas al usuario y despachos/recepciones que puede hacer. */
  async pendientes(u: UsuarioSesion) {
    if (!tiene(u, 'bodega.firmar_transferencia')) return [];
    const abiertas: { id: string }[] = await this.listar(u, { estado: 'ABIERTAS', limit: 200 });
    const out = [];
    for (const a of abiertas) {
      const d = await this.obtener(u, a.id);
      const accion = d.puede.aprobar ? 'APROBAR' : d.puede.despachar ? 'DESPACHAR' : d.puede.recibir ? 'RECIBIR' : null;
      if (!accion) continue;
      out.push({
        tipo: 'TRANSFERENCIA',
        transferenciaId: d.id,
        numero: d.numero,
        accion,
        etiqueta: { APROBAR: 'Aprobar', DESPACHAR: 'Despachar', RECIBIR: 'Recibir' }[accion],
        origen: d.origen.nombre,
        destino: d.destino.nombre,
        obraId: d.destino.obraId ?? d.origen.obraId,
        materiales: d.items.map((i: { nombre: string }) => i.nombre).join(', '),
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- utilidades
  private async cabecera(db: DataSource | EntityManager, id: string, bloquear = false): Promise<Cabecera> {
    const [t] = await db.query(
      `SELECT id, numero::int, estado, bodega_origen_id AS "bodegaOrigenId", bodega_destino_id AS "bodegaDestinoId", creado_por AS "creadoPor"
         FROM transferencias WHERE id = $1 ${bloquear ? 'FOR UPDATE' : ''}`,
      [id],
    );
    if (!t) throw new NotFoundException('Transferencia no encontrada');
    return t;
  }

  /** Acceso a origen y destino; basta con ver uno de los dos para ver la transferencia. */
  private async accesos(db: DataSource | EntityManager, u: UsuarioSesion, t: Cabecera): Promise<[BodegaAcceso, BodegaAcceso]> {
    const uno = async (bid: number): Promise<BodegaAcceso> => {
      try {
        return { ...(await asegurarAccesoBodega(db, u, bid)), acceso: true };
      } catch {
        const [b] = await db.query(
          `SELECT b.id, b.tipo, b.obra_id AS "obraId", CASE WHEN b.tipo = 'OBRA' THEN 'Bodega ' || o.nombre ELSE b.nombre END AS nombre,
                  o.nombre AS "obraNombre", o.estado AS "obraEstado", b.codigo
             FROM bodegas b LEFT JOIN obras o ON o.id = b.obra_id WHERE b.id = $1`,
          [bid],
        );
        return { ...b, acceso: false };
      }
    };
    const o = await uno(t.bodegaOrigenId);
    const d = await uno(t.bodegaDestinoId);
    if (!o.acceso && !d.acceso) throw new NotFoundException('Transferencia no encontrada');
    return [o, d];
  }

  /** La central la opera quien tiene bodega.ver (ya comprobado en el acceso); la de obra, su equipo. */
  private operaEn(b: BodegaAcceso) {
    return b.acceso && !(b.tipo === 'OBRA' && b.obraEstado === 'CERRADA');
  }

  private exigirEstado(t: Cabecera, estado: string, accion: string) {
    if (t.estado !== estado)
      throw new ConflictException(`No se puede ${accion}: la transferencia está ${t.estado.toLowerCase()}`);
  }

  /** Despacho y recepción los firma quien los ejecuta: se designa y firma en el mismo paso. */
  private async designarYFirmar(m: EntityManager, id: string, rol: 'DESPACHADO' | 'RECIBIDO', u: UsuarioSesion) {
    await m.query(
      `UPDATE firmas SET designado_id = $3 WHERE entidad_tipo = 'TRANSFERENCIA' AND entidad_id = $1 AND rol_firma = $2 AND firmado_en IS NULL`,
      [id, rol, u.id],
    );
    await this.firmas.firmar(m, 'TRANSFERENCIA', id, rol, u, undefined, COMPATIBLES[rol]);
  }

  /** Cantidades por ítem (por defecto, las de la etapa anterior) sin superar ese tope. */
  private async itemsConCantidad(
    m: EntityManager,
    id: string,
    indicados: ItemMovimientoTransferenciaDto[] | undefined,
    base: 'solicitada' | 'despachada',
    u: UsuarioSesion,
  ) {
    const filas: { materialId: number; tope: number; nombre: string }[] = await m.query(
      `SELECT i.material_id AS "materialId", COALESCE(i.cantidad_${base}, 0)::float AS tope, mt.nombre
         FROM transferencia_items i JOIN materiales mt ON mt.id = i.material_id WHERE i.transferencia_id = $1`,
      [id],
    );
    for (const x of indicados ?? [])
      if (!filas.some((f) => f.materialId === x.materialId)) throw new BadRequestException('Hay materiales que no están en la transferencia');
    const out = [];
    for (const f of filas) {
      const dado = indicados?.find((x) => x.materialId === f.materialId);
      const cantidad = dado ? dado.cantidad : f.tope;
      if (cantidad > f.tope + 1e-9)
        throw new BadRequestException(`${f.nombre}: no puede superar lo ${base} (${f.tope})`);
      out.push({ ...f, cantidad, nota: dado?.nota?.trim() || null, archivoId: await this.validarArchivo(m, dado?.archivoId, u) });
    }
    return out;
  }

  /** Foto o documento opcional de un material: debe haberlo subido el mismo usuario. */
  private async validarArchivo(m: EntityManager, archivoId: string | null | undefined, u: UsuarioSesion) {
    if (!archivoId) return null;
    const [a] = await m.query(
      `SELECT 1 FROM archivos WHERE id = $1 AND subido_por = $2 AND categoria IN ('DOCUMENTO','EVIDENCIA')`,
      [archivoId, u.id],
    );
    if (!a) throw new BadRequestException('Archivo adjunto no válido (súbelo tú mismo como foto o documento)');
    return archivoId;
  }

  private async registrarBitacora(m: EntityManager, u: UsuarioSesion, o: BodegaInfo, d: BodegaInfo, accion: string, detalle?: string) {
    const texto = `${o.nombre} → ${d.nombre}${detalle ? `. ${detalle}` : ''}`;
    for (const obraId of new Set([o.obraId, d.obraId]))
      await this.bitacora.registrar({ obraId, accion, detalle: texto, usuarioId: u.id }, m);
  }
}

type BodegaAcceso = BodegaInfo & { acceso: boolean };

const nombreBodega = (b: string, o: string) => `CASE WHEN ${b}.tipo = 'OBRA' THEN 'Bodega ' || ${o}.nombre ELSE ${b}.nombre END`;

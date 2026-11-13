import { Controller, ForbiddenException, Get, Module, Query, Res, StreamableFile } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { veTodas } from '../common/acceso-obra.js';
import { BitacoraService, MODULOS_BITACORA } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, ROL_SUPERADMIN, type UsuarioSesion } from '../common/decorators.js';
import { MIME_XLSX, generarExcel } from '../common/excel.js';

export class FiltroBitacoraDto {
  /** Una obra, o SIN_OBRA para configuración, usuarios y accesos. */
  @IsOptional() @IsString() @MaxLength(40) obraId?: string;
  @IsOptional() @IsUUID() usuarioId?: string;
  @IsOptional() @IsIn(MODULOS_BITACORA as unknown as string[]) modulo?: string;
  @IsOptional() @IsDateString({ strict: true }) desde?: string;
  @IsOptional() @IsDateString({ strict: true }) hasta?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(30) entidad?: string;
  @IsOptional() @IsString() @MaxLength(64) entidadId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
}

export class FiltroAuditoriaDto {
  @IsString() @MaxLength(60) tabla!: string;
  @IsString() @MaxLength(80) registroId!: string;
}

const COLUMNAS = `
  b.id::text AS id, b.created_at AS fecha, b.obra_id AS "obraId", o.nombre AS "obraNombre", b.modulo, b.accion, b.detalle,
  b.cambios, b.usuario_id AS "usuarioId", u.nombre AS "usuarioNombre", u.email AS "usuarioEmail",
  b.entidad, b.entidad_id AS "entidadId", b.ip, b.agente`;

@Controller()
export class BitacoraController {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  /**
   * Bitácora con filtros. Quien no ve todas las obras solo ve los eventos de sus obras
   * (los de configuración, usuarios y accesos quedan para el propietario).
   */
  @Get('bitacora')
  @Permisos('bitacora.ver')
  async listar(@Query() f: FiltroBitacoraDto, @CurrentUser() u: UsuarioSesion) {
    const limite = f.limite ?? 50;
    const pagina = f.pagina ?? 1;
    const { where, params } = this.filtro(f, u);
    const [{ total }] = await this.db.query(`SELECT COUNT(*)::int AS total FROM bitacora b ${where}`, params);
    const datos = await this.db.query(
      `SELECT ${COLUMNAS} FROM bitacora b LEFT JOIN obras o ON o.id = b.obra_id LEFT JOIN usuarios u ON u.id = b.usuario_id
       ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`,
      params,
    );
    return { datos, total, pagina, limite };
  }

  /** Obras y usuarios que aparecen en la bitácora (para los filtros). */
  @Get('bitacora/filtros')
  @Permisos('bitacora.ver')
  async filtros(@CurrentUser() u: UsuarioSesion) {
    const todas = veTodas(u);
    const [obras, usuarios] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.nombre FROM obras o
          WHERE ($1 OR EXISTS (SELECT 1 FROM obra_miembros m WHERE m.obra_id = o.id AND m.usuario_id = $2))
          ORDER BY o.nombre`,
        [todas, u.id],
      ),
      this.db.query(`SELECT id, nombre FROM usuarios ORDER BY nombre`),
    ]);
    return { obras, usuarios, modulos: MODULOS_BITACORA, sinObra: todas };
  }

  /** Excel con todos los eventos filtrados (hasta 50 000). */
  @Get('bitacora/exportar')
  @Permisos('bitacora.ver')
  async exportar(@Query() f: FiltroBitacoraDto, @CurrentUser() u: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    const { where, params } = this.filtro(f, u);
    const filas: Record<string, any>[] = await this.db.query(
      `SELECT ${COLUMNAS} FROM bitacora b LEFT JOIN obras o ON o.id = b.obra_id LEFT JOIN usuarios u ON u.id = b.usuario_id
       ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT 50000`,
      params,
    );
    const fmtFecha = (d: Date) => new Date(d).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
    const buffer = await generarExcel(
      'Bitácora',
      [
        { titulo: 'Fecha y hora', ancho: 20 },
        { titulo: 'Usuario', ancho: 24 },
        { titulo: 'Módulo', ancho: 13 },
        { titulo: 'Obra', ancho: 30 },
        { titulo: 'Acción', ancho: 40 },
        { titulo: 'Detalle', ancho: 50 },
        { titulo: 'Cambios (antes → después)', ancho: 60 },
        { titulo: 'IP', ancho: 15 },
        { titulo: 'Navegador', ancho: 40 },
      ],
      filas.map((x) => [
        fmtFecha(x.fecha),
        x.usuarioNombre ?? '(sin sesión)',
        x.modulo,
        x.obraNombre ?? '',
        x.accion,
        x.detalle ?? '',
        (x.cambios as { campo: string; antes: unknown; despues: unknown }[])
          .map((c) => `${c.campo}: ${c.antes ?? '—'} → ${c.despues ?? '—'}`)
          .join(' | '),
        x.ip ?? '',
        x.agente ?? '',
      ]),
      `Bitácora de ST-OBRAS (${filas.length} eventos)`,
    );
    await this.bitacora.registrar({
      accion: 'Exportó la bitácora',
      detalle: `${filas.length} eventos${f.obraId ? '' : ' (todas las obras)'}`,
      usuarioId: u.id,
      modulo: 'REPORTES',
    });
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="bitacora.xlsx"` });
    return new StreamableFile(buffer);
  }

  /** Auditoría técnica: cada cambio de un registro tal como quedó en la base (solo propietario). */
  @Get('auditoria')
  @Permisos('bitacora.ver')
  async auditoria(@Query() f: FiltroAuditoriaDto, @CurrentUser() u: UsuarioSesion) {
    if (!u.roles.includes(ROL_SUPERADMIN)) throw new ForbiddenException('La auditoría técnica es solo para el propietario');
    const filas: { datosAntes: Record<string, unknown> | null; datosDespues: Record<string, unknown> | null }[] = await this.db.query(
      `SELECT a.id::text AS id, a.created_at AS fecha, a.operacion, a.datos_antes AS "datosAntes", a.datos_despues AS "datosDespues",
              a.usuario_id AS "usuarioId", u.nombre AS "usuarioNombre"
         FROM auditoria_log a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.tabla = $1 AND a.registro_id = $2 ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
      [f.tabla, f.registroId],
    );
    const OCULTOS = new Set(['password_hash', 'costeo_pin_hash', 'token']);
    return filas.map((x) => {
      const antes = ocultar(x.datosAntes, OCULTOS);
      const despues = ocultar(x.datosDespues, OCULTOS);
      const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])];
      const cambios = claves
        .filter((k) => JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(despues?.[k] ?? null) && !['updated_at'].includes(k))
        .map((k) => ({ campo: k, antes: antes?.[k] ?? null, despues: despues?.[k] ?? null }));
      return { ...x, datosAntes: antes, datosDespues: despues, cambios };
    });
  }

  private filtro(f: FiltroBitacoraDto, u: UsuarioSesion) {
    const cond: string[] = [];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (!veTodas(u)) {
      cond.push(`b.obra_id IN (SELECT obra_id FROM obra_miembros WHERE usuario_id = ${p(u.id)})`);
    }
    // Los movimientos del costeo privado solo los ve quien tiene acceso al costeo
    if (!u.roles.includes(ROL_SUPERADMIN) && !u.permisos.includes('costeo.ver')) cond.push(`b.modulo IS DISTINCT FROM 'COSTEO'`);
    if (f.obraId === 'SIN_OBRA') cond.push('b.obra_id IS NULL');
    else if (f.obraId) {
      if (!/^[0-9a-f-]{36}$/i.test(f.obraId)) cond.push('FALSE');
      else cond.push(`b.obra_id = ${p(f.obraId)}`);
    }
    if (f.usuarioId) cond.push(`b.usuario_id = ${p(f.usuarioId)}`);
    if (f.modulo) cond.push(`b.modulo = ${p(f.modulo)}`);
    if (f.desde) cond.push(`b.created_at >= (${p(f.desde)}::date::timestamp AT TIME ZONE 'America/Guayaquil')`);
    if (f.hasta) cond.push(`b.created_at < ((${p(f.hasta)}::date + 1)::timestamp AT TIME ZONE 'America/Guayaquil')`);
    if (f.entidad) cond.push(`b.entidad = ${p(f.entidad)}`);
    if (f.entidadId) cond.push(`b.entidad_id = ${p(f.entidadId)}`);
    if (f.q?.trim()) {
      const q = p(`%${f.q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`);
      cond.push(`(b.accion ILIKE ${q} OR b.detalle ILIKE ${q} OR b.cambios::text ILIKE ${q})`);
    }
    return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
  }
}

function ocultar(d: Record<string, unknown> | null, ocultos: Set<string>) {
  if (!d) return d;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) out[k] = ocultos.has(k) ? '••••' : v;
  return out;
}

@Module({ controllers: [BitacoraController] })
export class BitacoraConsultaModule {}

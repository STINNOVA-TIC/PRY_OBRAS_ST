import { BadRequestException, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { asegurarAccesoObra, veTodas } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { MIME_XLSX, generarExcelHojas } from '../common/excel.js';
import { analizarObra, configRendimientos, umbrales } from './analisis.js';

export class PeriodoDto {
  @IsOptional() @IsDateString({ strict: true }) desde?: string;
  @IsOptional() @IsDateString({ strict: true }) hasta?: string;
}

export class GeneralDto extends PeriodoDto {
  /** Ids separados por coma; vacío = todas las obras visibles. */
  @IsOptional() @IsString() @MaxLength(4000) obras?: string;
}

const periodoTxt = (d?: string, h?: string) => `${d ?? 'inicio'} a ${h ?? 'hoy'}`;

@Injectable()
export class ReportesService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  async obra(u: UsuarioSesion, obraId: string, p: PeriodoDto) {
    validarPeriodo(p);
    await asegurarAccesoObra(this.db, u, obraId);
    const [o] = await this.db.query(`SELECT nombre, estado, cliente FROM obras WHERE id = $1`, [obraId]);
    return { obra: o, ...(await analizarObra(this.db, obraId, p.desde ?? null, p.hasta ?? null)) };
  }

  async exportarObra(u: UsuarioSesion, obraId: string, p: PeriodoDto) {
    const r = await this.obra(u, obraId, p);
    const per = periodoTxt(p.desde, p.hasta);
    const buffer = await generarExcelHojas([
      {
        nombre: 'Avance por rubro',
        titulo: `${r.obra.nombre} — avance por rubro (${per})`,
        columnas: [
          { titulo: 'Código', ancho: 10 }, { titulo: 'Rubro', ancho: 44 }, { titulo: 'Unid.', ancho: 7 },
          { titulo: 'Contrato', numero: true }, { titulo: 'P. unitario', numero: true }, { titulo: 'En el período', numero: true },
          { titulo: 'Monto período', numero: true }, { titulo: 'Acumulado', numero: true }, { titulo: 'Monto acumulado', numero: true },
          { titulo: '% avance', numero: true, decimales: 1 },
        ],
        filas: [
          ...r.rubros.map((x) => [x.codigo, x.descripcion, x.unidad, x.cantidad, x.pu, x.periodo, x.montoPeriodo, x.acumulado, x.montoAcumulado, x.pct]),
          [null, 'TOTAL', null, null, null, null, r.totales.montoPeriodo, null, r.totales.montoAcumulado, r.totales.pct],
        ],
      },
      {
        nombre: 'Consumo de materiales',
        titulo: `Consumo real vs. programado (${per}) · tolerancias ±${r.umbrales.t1} % / ±${r.umbrales.t2} %`,
        columnas: [
          { titulo: 'Código', ancho: 10 }, { titulo: 'Material', ancho: 36 }, { titulo: 'Unid.', ancho: 7 },
          { titulo: 'Programado', numero: true }, { titulo: 'Real', numero: true }, { titulo: 'Diferencia', numero: true },
          { titulo: 'Variación', numero: true, decimales: 1 }, { titulo: 'Valor diferencia', numero: true }, { titulo: 'Estado', ancho: 26 },
        ],
        filas: r.materiales.map((x) => [x.codigo, x.nombre, x.unidad, x.programado, x.real, x.diferencia, x.evaluacion.v ?? null, x.valorDiferencia, x.evaluacion.t]),
      },
      {
        nombre: 'Consumo por rubro',
        columnas: [
          { titulo: 'Rubro', ancho: 40 }, { titulo: 'Material', ancho: 32 }, { titulo: 'Unid.', ancho: 7 },
          { titulo: 'Programado', numero: true }, { titulo: 'Real', numero: true }, { titulo: 'Estado', ancho: 26 },
        ],
        filas: r.detalle.map((x) => [x.rubro, x.material, x.unidad, x.programado, x.real, x.evaluacion.t]),
      },
      {
        nombre: 'Rendimientos',
        columnas: [
          { titulo: 'Rendimiento', ancho: 40 }, { titulo: 'Valor', numero: true }, { titulo: 'Unidad', ancho: 26 },
          { titulo: 'Producción / consumo', numero: true }, { titulo: 'Consumo / base', numero: true },
          { titulo: 'Mínimo', numero: true }, { titulo: 'Ideal', numero: true }, { titulo: 'Máximo', numero: true }, { titulo: 'Estado', ancho: 28 },
        ],
        filas: r.rendimientos.map((x) => [
          x.nombre, x.valor, `${x.unidadN} por ${x.unidadD}`, x.N, x.D, x.minimo, x.ideal, x.maximo, x.evaluacion.t,
        ]),
      },
    ]);
    await this.bitacora.registrar({ obraId, accion: 'Exportó el reporte de la obra', detalle: `Período ${per}`, usuarioId: u.id, modulo: 'REPORTES' });
    return { buffer, nombre: `reporte_${r.obra.nombre.replace(/[^\w-]+/g, '_').slice(0, 40)}.xlsx` };
  }

  /** Reporte general: todas las obras visibles (o las elegidas) en un solo informe. */
  async general(u: UsuarioSesion, p: GeneralDto) {
    validarPeriodo(p);
    const elegidas = p.obras ? p.obras.split(',').map((x) => x.trim()).filter(Boolean) : null;
    if (elegidas?.some((x) => !/^[0-9a-f-]{36}$/i.test(x))) throw new BadRequestException('Obras no válidas');
    const visibles: { id: string; nombre: string; cliente: string | null; estado: string; codigo: string | null }[] = await this.db.query(
      `SELECT o.id, o.nombre, o.cliente, o.estado, o.codigo FROM obras o
        WHERE o.eliminado_en IS NULL
          AND ($1 OR EXISTS (SELECT 1 FROM obra_miembros m WHERE m.obra_id = o.id AND m.usuario_id = $2))
        ORDER BY o.nombre`,
      [veTodas(u), u.id],
    );
    const obras = elegidas ? visibles.filter((o) => elegidas.includes(o.id)) : visibles;
    const cfg = { ...(await umbrales(this.db)), rend: await configRendimientos(this.db) };
    const filas = [];
    for (const o of obras.filter((x) => x.estado !== 'HABILITACION')) {
      const a = await analizarObra(this.db, o.id, p.desde ?? null, p.hasta ?? null, cfg);
      const rend = a.rendimientos.filter((x) => x.evaluacion.k !== 'nd');
      filas.push({
        obra: o,
        totales: a.totales,
        rubros: a.rubros,
        materiales: a.materiales,
        rendimientos: rend,
        alertas: rend.filter((x) => x.evaluacion.k !== 'ok').length + a.materiales.filter((x) => x.evaluacion.k === 'fuera').length,
      });
    }
    const hab = await this.db.query(
      `SELECT o.id, o.nombre, o.cliente,
              (SELECT COUNT(*)::int FROM tipos_requisito t WHERE t.activo) AS total,
              (SELECT COUNT(*)::int FROM obra_requisitos r JOIN tipos_requisito t ON t.id = r.tipo_id AND t.activo
                WHERE r.obra_id = o.id AND r.revisado_en IS NOT NULL) AS hechos,
              (SELECT COUNT(*)::int FROM obra_contratistas oc WHERE oc.obra_id = o.id) AS contratistas,
              (SELECT COUNT(*)::int FROM firmas f WHERE f.entidad_tipo = 'HABILITACION' AND f.entidad_id = o.id AND f.firmado_en IS NOT NULL) AS firmas
         FROM obras o WHERE o.id = ANY($1::uuid[]) AND o.estado = 'HABILITACION' ORDER BY o.nombre`,
      [obras.map((o) => o.id)],
    );
    const contratado = filas.reduce((s, x) => s + x.totales.contratado, 0);
    const ejecutado = filas.reduce((s, x) => s + x.totales.montoAcumulado, 0);
    const periodo = filas.reduce((s, x) => s + x.totales.montoPeriodo, 0);
    return {
      periodo: { desde: p.desde ?? null, hasta: p.hasta ?? null },
      visibles: visibles.map((o) => ({ id: o.id, nombre: o.nombre, estado: o.estado })),
      totales: { contratado, ejecutado, periodo, pct: contratado > 0 ? ejecutado / contratado : 0, alertas: filas.reduce((s, x) => s + x.alertas, 0) },
      obras: filas,
      habilitacion: hab,
    };
  }

  async registrarImpresionGeneral(u: UsuarioSesion, p: GeneralDto, n: number) {
    await this.bitacora.registrar({
      accion: 'Generó el reporte general',
      detalle: `${n} obra(s), período ${periodoTxt(p.desde, p.hasta)}`,
      usuarioId: u.id,
      modulo: 'REPORTES',
    });
  }
}

function validarPeriodo(p: PeriodoDto) {
  if (p.desde && p.hasta && p.hasta < p.desde) throw new BadRequestException('El período termina antes de empezar');
}

@Controller()
export class ReportesController {
  constructor(private readonly s: ReportesService) {}

  @Get('obras/:obraId/reporte')
  @Permisos('reportes.ver')
  obra(@Param('obraId', ParseUUIDPipe) obraId: string, @Query() p: PeriodoDto, @CurrentUser() u: UsuarioSesion) {
    return this.s.obra(u, obraId, p);
  }

  @Get('obras/:obraId/reporte/exportar')
  @Permisos('reportes.ver', 'reportes.exportar')
  async exportar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Query() p: PeriodoDto,
    @CurrentUser() u: UsuarioSesion,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, nombre } = await this.s.exportarObra(u, obraId, p);
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }

  @Get('reportes/general')
  @Permisos('reportes.ver')
  general(@Query() p: GeneralDto, @CurrentUser() u: UsuarioSesion) {
    return this.s.general(u, p);
  }

  /** La vista de impresión avisa que se generó el PDF (para la bitácora). */
  @Get('reportes/general/impreso')
  @Permisos('reportes.ver', 'reportes.exportar')
  async impreso(@Query() p: GeneralDto, @CurrentUser() u: UsuarioSesion) {
    const n = p.obras ? p.obras.split(',').filter(Boolean).length : 0;
    await this.s.registrarImpresionGeneral(u, p, n);
    return { ok: true };
  }
}

@Module({ controllers: [ReportesController], providers: [ReportesService] })
export class ReportesModule {}

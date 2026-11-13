import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  StreamableFile,
  ForbiddenException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { asegurarAccesoObra, veTodas } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { MIME_XLSX, generarExcelHojas } from '../common/excel.js';
import { hashPassword, verificarPassword } from '../common/password.js';
import { enTransaccion } from '../common/transaccion.js';

// ---------------------------------------------------------------- DTO
const PIN = /^\d{4,8}$/;

class CrearPinDto {
  @IsOptional() @IsString() @Matches(PIN) pinActual?: string;
  @IsString() @Matches(PIN, { message: 'El código debe tener de 4 a 8 números' }) pinNuevo!: string;
}
class RestablecerPinDto {
  @IsString() @Length(1, 72) password!: string;
  @IsString() @Matches(PIN, { message: 'El código debe tener de 4 a 8 números' }) pinNuevo!: string;
}
class DesbloquearDto {
  @IsString() @Matches(PIN, { message: 'Código no válido' }) pin!: string;
}
class CostoRubroDto {
  /** null = calcular con insumos × costo del material. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1e9) mat?: number | null;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1e9) mo!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1e9) eq!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1e9) sub!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1e9) otr!: number;
}
class IndirectoDto {
  @IsString() @Length(1, 200) descripcion!: string;
  @IsIn(['PCT', 'MONTO']) tipo!: 'PCT' | 'MONTO';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1e11) valor!: number;
}
class IndirectosDto {
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => IndirectoDto) items!: IndirectoDto[];
}
class CostoMaterialDto {
  /** null = volver al costo del catálogo. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1e9) costo?: number | null;
}

/** Indirectos sugeridos (los de la app anterior), en cero hasta que se guarden. */
const IND_BASE = [
  'Administración central', 'Personal técnico y administrativo de obra', 'Movilización y transporte de personal y equipos',
  'Alimentación y hospedaje (viáticos)', 'Vehículos y combustible de apoyo', 'Pólizas y garantías (fiel cumplimiento, anticipo)',
  'Costos financieros', 'Seguridad industrial, EPP y salud ocupacional', 'Señalización temporal y plan de manejo de tránsito',
  'Ensayos de laboratorio y control de calidad', 'Campamento, bodega y servicios', 'Impuestos y contribuciones', 'Imprevistos',
];

const MINUTOS_SESION = 30;
const MAX_FALLOS = 5;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Costeo privado: además del permiso costeo.ver, cada persona entra con su código (PIN).
 * Al desbloquear se entrega un token de 30 minutos que viaja en la cabecera X-Costeo-Token.
 */
@Injectable()
export class CosteoService {
  private readonly sesiones = new Map<string, { usuarioId: string; vence: number }>();
  private readonly fallos = new Map<string, { n: number; hasta: number }>();

  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  // ---------- código de acceso
  async estado(u: UsuarioSesion) {
    const [x] = await this.db.query(`SELECT costeo_pin_hash IS NOT NULL AS "tienePin" FROM usuarios WHERE id = $1`, [u.id]);
    return { tienePin: !!x?.tienePin, minutos: MINUTOS_SESION };
  }

  async guardarPin(u: UsuarioSesion, d: CrearPinDto) {
    const [x] = await this.db.query(`SELECT costeo_pin_hash AS h FROM usuarios WHERE id = $1`, [u.id]);
    if (x?.h) {
      if (!d.pinActual || !(await verificarPassword(d.pinActual, x.h))) {
        await this.bitacora.registrar({ accion: 'Costeo: intentó cambiar su código con un código incorrecto', usuarioId: u.id, modulo: 'COSTEO' });
        throw new BadRequestException('El código actual no es correcto');
      }
    }
    await this.db.query(`UPDATE usuarios SET costeo_pin_hash = $2 WHERE id = $1`, [u.id, await hashPassword(d.pinNuevo)]);
    await this.bitacora.registrar({ accion: x?.h ? 'Costeo: cambió su código de acceso' : 'Costeo: creó su código de acceso', usuarioId: u.id, modulo: 'COSTEO' });
    return this.abrirSesion(u);
  }

  /** «Olvidé mi código»: con la contraseña de la cuenta se fija uno nuevo. */
  async restablecerPin(u: UsuarioSesion, d: RestablecerPinDto) {
    const [x] = await this.db.query(`SELECT password_hash AS h FROM usuarios WHERE id = $1`, [u.id]);
    if (!x || !(await verificarPassword(d.password, x.h))) {
      await this.bitacora.registrar({ accion: 'Costeo: intentó restablecer su código con una contraseña incorrecta', usuarioId: u.id, modulo: 'COSTEO' });
      throw new BadRequestException('La contraseña no es correcta');
    }
    await this.db.query(`UPDATE usuarios SET costeo_pin_hash = $2 WHERE id = $1`, [u.id, await hashPassword(d.pinNuevo)]);
    this.fallos.delete(u.id);
    await this.bitacora.registrar({ accion: 'Costeo: restableció su código de acceso', usuarioId: u.id, modulo: 'COSTEO' });
    return this.abrirSesion(u);
  }

  async desbloquear(u: UsuarioSesion, d: DesbloquearDto) {
    const f = this.fallos.get(u.id);
    if (f && f.n >= MAX_FALLOS && f.hasta > Date.now())
      throw new ForbiddenException(`Demasiados intentos: espera ${Math.ceil((f.hasta - Date.now()) / 60000)} min o restablécelo con tu contraseña`);
    const [x] = await this.db.query(`SELECT costeo_pin_hash AS h FROM usuarios WHERE id = $1`, [u.id]);
    if (!x?.h) throw new BadRequestException('Primero crea tu código de acceso');
    if (!(await verificarPassword(d.pin, x.h))) {
      const n = (f && f.hasta > Date.now() ? f.n : 0) + 1;
      this.fallos.set(u.id, { n, hasta: Date.now() + 15 * 60000 });
      await this.bitacora.registrar({ accion: 'Costeo: código de acceso incorrecto', detalle: `Intento ${n} de ${MAX_FALLOS}`, usuarioId: u.id, modulo: 'COSTEO' });
      throw new BadRequestException('Código incorrecto');
    }
    this.fallos.delete(u.id);
    await this.bitacora.registrar({ accion: 'Costeo: entró al costeo privado', usuarioId: u.id, modulo: 'COSTEO' });
    return this.abrirSesion(u);
  }

  bloquear(token?: string) {
    if (token) this.sesiones.delete(token);
    return { ok: true };
  }

  private abrirSesion(u: UsuarioSesion) {
    const ahora = Date.now();
    for (const [k, s] of this.sesiones) if (s.vence < ahora) this.sesiones.delete(k);
    const token = randomBytes(32).toString('hex');
    const vence = ahora + MINUTOS_SESION * 60000;
    this.sesiones.set(token, { usuarioId: u.id, vence });
    return { token, vence: new Date(vence).toISOString() };
  }

  private exigir(u: UsuarioSesion, token?: string) {
    const s = token ? this.sesiones.get(token) : undefined;
    if (!s || s.usuarioId !== u.id || s.vence < Date.now()) {
      if (token) this.sesiones.delete(token);
      throw new ForbiddenException('COSTEO_BLOQUEADO');
    }
    s.vence = Date.now() + MINUTOS_SESION * 60000; // se renueva con el uso
  }

  // ---------- datos
  async obras(u: UsuarioSesion, token?: string) {
    this.exigir(u, token);
    return this.db.query(
      `SELECT o.id, o.nombre, o.cliente, o.estado,
              EXISTS (SELECT 1 FROM costeo_rubros c WHERE c.obra_id = o.id) OR EXISTS (SELECT 1 FROM costeo_indirectos c WHERE c.obra_id = o.id) AS "conCosteo"
         FROM obras o
        WHERE o.eliminado_en IS NULL AND ($1 OR EXISTS (SELECT 1 FROM obra_miembros m WHERE m.obra_id = o.id AND m.usuario_id = $2))
        ORDER BY o.nombre`,
      [veTodas(u), u.id],
    );
  }

  async obra(u: UsuarioSesion, obraId: string, token?: string) {
    this.exigir(u, token);
    await asegurarAccesoObra(this.db, u, obraId);
    return this.calcular(obraId);
  }

  /** Igual que costeoObra() de la app anterior. */
  private async calcular(obraId: string) {
    const [o] = await this.db.query(`SELECT id, nombre, cliente, estado FROM obras WHERE id = $1`, [obraId]);
    const rubros: {
      id: string; codigo: string | null; descripcion: string; unidad: string; cantidad: number; pu: number; ejecutado: number;
      mat: number | null; mo: number; eq: number; sub: number; otr: number; conCosto: boolean;
    }[] = await this.db.query(
      `SELECT r.id, r.codigo, r.descripcion, r.unidad, r.cantidad::float, r.precio_unitario::float AS pu,
              COALESCE((SELECT SUM(a.cantidad) FROM avances a WHERE a.obra_rubro_id = r.id AND a.anulado_en IS NULL), 0)::float AS ejecutado,
              c.mat::float, COALESCE(c.mo, 0)::float AS mo, COALESCE(c.eq, 0)::float AS eq, COALESCE(c.sub, 0)::float AS sub,
              COALESCE(c.otr, 0)::float AS otr, (c.obra_rubro_id IS NOT NULL) AS "conCosto"
         FROM obra_rubros r LEFT JOIN costeo_rubros c ON c.obra_rubro_id = r.id
        WHERE r.obra_id = $1 ORDER BY r.orden, r.created_at`,
      [obraId],
    );
    const insumos: { r: string; m: number; q: number }[] = await this.db.query(
      `SELECT i.obra_rubro_id AS r, i.material_id AS m, i.cantidad_por_unidad::float AS q
         FROM obra_rubro_insumos i JOIN obra_rubros r ON r.id = i.obra_rubro_id WHERE r.obra_id = $1`,
      [obraId],
    );
    const consumo: { m: number; q: number }[] = await this.db.query(
      `SELECT mi.material_id AS m, -SUM(mi.cantidad)::float AS q
         FROM movimientos_inventario mi JOIN bodegas b ON b.id = mi.bodega_id
        WHERE b.obra_id = $1 AND mi.tipo = 'CONSUMO' GROUP BY 1`,
      [obraId],
    );
    const usados = [...new Set([...insumos.map((i) => i.m), ...consumo.map((c) => c.m)])];
    const materiales: { id: number; codigo: string; nombre: string; unidad: string; costoCatalogo: number; costoObra: number | null }[] =
      await this.db.query(
        `SELECT m.id, m.codigo, m.nombre, m.unidad, m.costo_unitario::float AS "costoCatalogo", cm.costo::float AS "costoObra"
           FROM materiales m LEFT JOIN costeo_materiales cm ON cm.material_id = m.id AND cm.obra_id = $1
          WHERE m.id = ANY($2::int[]) ORDER BY m.codigo`,
        [obraId, usados],
      );
    const costoMat = new Map(materiales.map((m) => [m.id, m.costoObra ?? m.costoCatalogo]));
    const guardados: { id: string; descripcion: string; tipo: 'PCT' | 'MONTO'; valor: number }[] = await this.db.query(
      `SELECT id, descripcion, tipo, valor::float FROM costeo_indirectos WHERE obra_id = $1 ORDER BY orden, descripcion`,
      [obraId],
    );
    const sugeridos = !guardados.length;
    const indBase = sugeridos ? IND_BASE.map((d) => ({ id: null as string | null, descripcion: d, tipo: 'MONTO' as const, valor: 0 })) : guardados;

    const base = rubros.map((r) => {
      const matAuto = insumos.filter((i) => i.r === r.id).reduce((s, i) => s + i.q * (costoMat.get(i.m) ?? 0), 0);
      const v = { mat: r.mat ?? matAuto, mo: r.mo, eq: r.eq, sub: r.sub, otr: r.otr };
      return { r, matAuto, v, directo: v.mat + v.mo + v.eq + v.sub + v.otr };
    });
    const directoContrato = base.reduce((s, x) => s + x.r.cantidad * x.directo, 0);
    const indirectos = indBase.map((it) => ({ ...it, usd: r2(it.tipo === 'PCT' ? (it.valor / 100) * directoContrato : it.valor) }));
    const totalIndirectos = indirectos.reduce((s, x) => s + x.usd, 0);
    const factorInd = directoContrato ? totalIndirectos / directoContrato : 0;

    const filas = base.map(({ r, matAuto, directo }) => {
      const costoUnit = directo * (1 + factorInd);
      const margenUnit = r.pu - costoUnit;
      return {
        id: r.id, codigo: r.codigo, descripcion: r.descripcion, unidad: r.unidad, cantidad: r.cantidad, pu: r.pu, ejecutado: r.ejecutado,
        mat: r.mat, matAuto, mo: r.mo, eq: r.eq, sub: r.sub, otr: r.otr, conCosto: r.conCosto,
        directo, costoUnit, margenUnit, margenPct: r.pu ? margenUnit / r.pu : null,
        ventaContrato: r2(r.cantidad * r.pu), costoContrato: r2(r.cantidad * costoUnit),
        ventaEjecutada: r2(r.ejecutado * r.pu), costoEjecutado: r2(r.ejecutado * costoUnit),
      };
    });
    const suma = (k: 'ventaContrato' | 'costoContrato' | 'ventaEjecutada' | 'costoEjecutado') => r2(filas.reduce((s, x) => s + x[k], 0));
    // Costo real: consumo real de bodega × costo interno + otros costos por la cantidad ejecutada, con indirectos
    const consumoMat = materiales
      .map((m) => {
        const q = consumo.find((c) => c.m === m.id)?.q ?? 0;
        return { ...m, costo: costoMat.get(m.id) ?? 0, consumo: q, valor: r2(q * (costoMat.get(m.id) ?? 0)) };
      });
    const matReal = r2(consumoMat.reduce((s, m) => s + m.valor, 0));
    const otrosReal = filas.reduce((s, x) => s + x.ejecutado * (x.mo + x.eq + x.sub + x.otr), 0);
    const costoReal = r2((matReal + otrosReal) * (1 + factorInd));
    const ventaContrato = suma('ventaContrato');
    const costoContrato = suma('costoContrato');
    const ventaEjecutada = suma('ventaEjecutada');
    return {
      obra: o,
      rubros: filas,
      indirectos,
      indirectosSugeridos: sugeridos,
      materiales: consumoMat,
      totales: {
        directoContrato: r2(directoContrato),
        totalIndirectos: r2(totalIndirectos),
        factorIndirectos: factorInd,
        ventaContrato,
        costoContrato,
        utilidadContrato: r2(ventaContrato - costoContrato),
        margenContrato: ventaContrato ? (ventaContrato - costoContrato) / ventaContrato : 0,
        ventaEjecutada,
        costoEjecutado: suma('costoEjecutado'),
        materialReal: matReal,
        costoReal,
        utilidadReal: r2(ventaEjecutada - costoReal),
        margenReal: ventaEjecutada ? (ventaEjecutada - costoReal) / ventaEjecutada : 0,
      },
    };
  }

  async guardarRubro(u: UsuarioSesion, obraId: string, rubroId: string, d: CostoRubroDto, token?: string) {
    this.exigir(u, token);
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const [r] = await m.query(
        `SELECT r.descripcion, c.mat::float, c.mo::float, c.eq::float, c.sub::float, c.otr::float
           FROM obra_rubros r LEFT JOIN costeo_rubros c ON c.obra_rubro_id = r.id WHERE r.id = $1 AND r.obra_id = $2`,
        [rubroId, obraId],
      );
      if (!r) throw new NotFoundException('Rubro no encontrado');
      await m.query(
        `INSERT INTO costeo_rubros (obra_rubro_id, obra_id, mat, mo, eq, sub, otr) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (obra_rubro_id) DO UPDATE SET mat = EXCLUDED.mat, mo = EXCLUDED.mo, eq = EXCLUDED.eq, sub = EXCLUDED.sub,
                otr = EXCLUDED.otr, updated_at = now()`,
        [rubroId, obraId, d.mat ?? null, d.mo, d.eq, d.sub, d.otr],
      );
      const cambios = BitacoraService.diferencias(
        { mat: r.mat ?? 'auto', mo: r.mo ?? 0, eq: r.eq ?? 0, sub: r.sub ?? 0, otr: r.otr ?? 0 },
        { mat: d.mat ?? 'auto', mo: d.mo, eq: d.eq, sub: d.sub, otr: d.otr },
        { mat: 'Materiales', mo: 'Mano de obra', eq: 'Equipo', sub: 'Subcontrato', otr: 'Otros' },
      );
      if (cambios.length)
        await this.bitacora.registrar({ obraId, accion: 'Costeo: cambió costos de un rubro', detalle: r.descripcion, cambios, usuarioId: u.id, modulo: 'COSTEO' }, m);
    });
    return this.calcular(obraId);
  }

  async guardarIndirectos(u: UsuarioSesion, obraId: string, d: IndirectosDto, token?: string) {
    this.exigir(u, token);
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const antes: { descripcion: string; tipo: string; valor: number }[] = await m.query(
        `SELECT descripcion, tipo, valor::float FROM costeo_indirectos WHERE obra_id = $1 ORDER BY orden`,
        [obraId],
      );
      await m.query(`DELETE FROM costeo_indirectos WHERE obra_id = $1`, [obraId]);
      let orden = 0;
      for (const it of d.items)
        await m.query(`INSERT INTO costeo_indirectos (obra_id, descripcion, tipo, valor, orden) VALUES ($1,$2,$3,$4,$5)`, [
          obraId, it.descripcion.trim(), it.tipo, it.valor, orden++,
        ]);
      const txt = (l: { descripcion: string; tipo: string; valor: number }[]) =>
        l.filter((x) => x.valor > 0).map((x) => `${x.descripcion}: ${x.tipo === 'PCT' ? `${x.valor} %` : `$${x.valor}`}`).join('; ');
      if (txt(antes) !== txt(d.items))
        await this.bitacora.registrar(
          { obraId, accion: 'Costeo: cambió los indirectos', cambios: [{ campo: 'Indirectos', antes: txt(antes) || null, despues: txt(d.items) || null }], usuarioId: u.id, modulo: 'COSTEO' },
          m,
        );
    });
    return this.calcular(obraId);
  }

  async guardarMaterial(u: UsuarioSesion, obraId: string, materialId: number, d: CostoMaterialDto, token?: string) {
    this.exigir(u, token);
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const [x] = await m.query(
        `SELECT m.nombre, cm.costo::float FROM materiales m LEFT JOIN costeo_materiales cm ON cm.material_id = m.id AND cm.obra_id = $1 WHERE m.id = $2`,
        [obraId, materialId],
      );
      if (!x) throw new NotFoundException('Material no encontrado');
      if (d.costo == null) await m.query(`DELETE FROM costeo_materiales WHERE obra_id = $1 AND material_id = $2`, [obraId, materialId]);
      else
        await m.query(
          `INSERT INTO costeo_materiales (obra_id, material_id, costo) VALUES ($1,$2,$3)
           ON CONFLICT (obra_id, material_id) DO UPDATE SET costo = EXCLUDED.costo`,
          [obraId, materialId, d.costo],
        );
      if ((x.costo ?? null) !== (d.costo ?? null))
        await this.bitacora.registrar(
          {
            obraId,
            accion: 'Costeo: cambió el costo interno de un material',
            detalle: x.nombre,
            cambios: [{ campo: 'Costo en la obra', antes: x.costo ?? 'del catálogo', despues: d.costo ?? 'del catálogo' }],
            usuarioId: u.id,
            modulo: 'COSTEO',
          },
          m,
        );
    });
    return this.calcular(obraId);
  }

  async exportar(u: UsuarioSesion, obraId: string, token?: string) {
    const c = await this.obra(u, obraId, token);
    const t = c.totales;
    const buffer = await generarExcelHojas([
      {
        nombre: 'Costeo por rubro',
        titulo: `Costeo privado — ${c.obra.nombre} (indirectos ${(t.factorIndirectos * 100).toFixed(2)} % del directo)`,
        columnas: [
          { titulo: 'Rubro', ancho: 40 }, { titulo: 'Unid.', ancho: 7 }, { titulo: 'Cantidad', numero: true }, { titulo: 'P. venta', numero: true },
          { titulo: 'Materiales', numero: true }, { titulo: 'Mano de obra', numero: true }, { titulo: 'Equipo', numero: true },
          { titulo: 'Subcontrato', numero: true }, { titulo: 'Otros', numero: true }, { titulo: 'Costo directo', numero: true },
          { titulo: 'Costo unitario', numero: true }, { titulo: 'Margen unit.', numero: true }, { titulo: 'Margen %', numero: true, decimales: 1 },
          { titulo: 'Venta contrato', numero: true }, { titulo: 'Costo contrato', numero: true }, { titulo: 'Ejecutado', numero: true },
        ],
        filas: [
          ...c.rubros.map((r) => [
            r.descripcion, r.unidad, r.cantidad, r.pu, r.mat ?? r.matAuto, r.mo, r.eq, r.sub, r.otr, r.directo, r.costoUnit, r.margenUnit, r.margenPct,
            r.ventaContrato, r.costoContrato, r.ejecutado,
          ]),
          [],
          ['Venta contrato', null, null, null, null, null, null, null, null, null, null, null, null, t.ventaContrato],
          ['Costo contrato', null, null, null, null, null, null, null, null, null, null, null, null, t.costoContrato],
          ['Utilidad estimada', null, null, null, null, null, null, null, null, null, null, null, t.margenContrato, t.utilidadContrato],
          ['Venta ejecutada', null, null, null, null, null, null, null, null, null, null, null, null, t.ventaEjecutada],
          ['Costo real', null, null, null, null, null, null, null, null, null, null, null, null, t.costoReal],
          ['Utilidad real', null, null, null, null, null, null, null, null, null, null, null, t.margenReal, t.utilidadReal],
        ],
      },
      {
        nombre: 'Indirectos',
        columnas: [{ titulo: 'Concepto', ancho: 50 }, { titulo: 'Tipo', ancho: 10 }, { titulo: 'Valor', numero: true }, { titulo: 'USD', numero: true }],
        filas: c.indirectos.map((i) => [i.descripcion, i.tipo === 'PCT' ? '%' : 'Monto', i.valor, i.usd]),
      },
      {
        nombre: 'Materiales',
        columnas: [
          { titulo: 'Código', ancho: 10 }, { titulo: 'Material', ancho: 36 }, { titulo: 'Unid.', ancho: 7 }, { titulo: 'Costo', numero: true },
          { titulo: 'Consumido', numero: true }, { titulo: 'Valor consumido', numero: true },
        ],
        filas: c.materiales.map((m) => [m.codigo, m.nombre, m.unidad, m.costo, m.consumo, m.valor]),
      },
    ]);
    await this.bitacora.registrar({ obraId, accion: 'Costeo: exportó el costeo de la obra', usuarioId: u.id, modulo: 'COSTEO' });
    return { buffer, nombre: `costeo_${c.obra.nombre.replace(/[^\w-]+/g, '_').slice(0, 40)}.xlsx` };
  }
}

const T = 'x-costeo-token';

@Controller('costeo')
export class CosteoController {
  constructor(private readonly s: CosteoService) {}

  @Get('estado') @Permisos('costeo.ver')
  estado(@CurrentUser() u: UsuarioSesion) { return this.s.estado(u); }

  @Post('pin') @HttpCode(200) @Permisos('costeo.ver')
  pin(@Body() d: CrearPinDto, @CurrentUser() u: UsuarioSesion) { return this.s.guardarPin(u, d); }

  @Post('pin/restablecer') @HttpCode(200) @Permisos('costeo.ver')
  restablecer(@Body() d: RestablecerPinDto, @CurrentUser() u: UsuarioSesion) { return this.s.restablecerPin(u, d); }

  @Post('desbloquear') @HttpCode(200) @Permisos('costeo.ver')
  desbloquear(@Body() d: DesbloquearDto, @CurrentUser() u: UsuarioSesion) { return this.s.desbloquear(u, d); }

  @Post('bloquear') @HttpCode(200) @Permisos('costeo.ver')
  bloquear(@Headers(T) token?: string) { return this.s.bloquear(token); }

  @Get('obras') @Permisos('costeo.ver')
  obras(@CurrentUser() u: UsuarioSesion, @Headers(T) token?: string) { return this.s.obras(u, token); }

  @Get('obras/:obraId') @Permisos('costeo.ver')
  obra(@Param('obraId', ParseUUIDPipe) obraId: string, @CurrentUser() u: UsuarioSesion, @Headers(T) token?: string) {
    return this.s.obra(u, obraId, token);
  }

  @Get('obras/:obraId/exportar') @Permisos('costeo.ver')
  async exportar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @CurrentUser() u: UsuarioSesion,
    @Res({ passthrough: true }) res: Response,
    @Headers(T) token?: string,
  ) {
    const { buffer, nombre } = await this.s.exportar(u, obraId, token);
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }

  @Put('obras/:obraId/rubros/:rubroId') @Permisos('costeo.ver', 'costeo.editar')
  rubro(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('rubroId', ParseUUIDPipe) rubroId: string,
    @Body() d: CostoRubroDto,
    @CurrentUser() u: UsuarioSesion,
    @Headers(T) token?: string,
  ) {
    return this.s.guardarRubro(u, obraId, rubroId, d, token);
  }

  @Put('obras/:obraId/indirectos') @Permisos('costeo.ver', 'costeo.editar')
  indirectos(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() d: IndirectosDto, @CurrentUser() u: UsuarioSesion, @Headers(T) token?: string) {
    return this.s.guardarIndirectos(u, obraId, d, token);
  }

  @Put('obras/:obraId/materiales/:materialId') @Permisos('costeo.ver', 'costeo.editar')
  material(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('materialId', ParseIntPipe) materialId: number,
    @Body() d: CostoMaterialDto,
    @CurrentUser() u: UsuarioSesion,
    @Headers(T) token?: string,
  ) {
    return this.s.guardarMaterial(u, obraId, materialId, d, token);
  }
}

@Module({ controllers: [CosteoController], providers: [CosteoService] })
export class CosteoModule {}

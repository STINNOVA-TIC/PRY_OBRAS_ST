import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { BitacoraService } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';

// ================================================================ parámetros

/** Parámetros editables y cómo se validan. */
const PARAMETROS: Record<string, { etiqueta: string; tipo: 'pct' | 'texto' | 'entero'; max?: number }> = {
  UMBRAL_ALERTA_PCT: { etiqueta: 'Tolerancia de consumo: dentro de lo programado hasta ± (%)', tipo: 'pct', max: 100 },
  UMBRAL_CRITICO_PCT: { etiqueta: 'Tolerancia de consumo: alerta hasta ± (%)', tipo: 'pct', max: 200 },
  IVA_PCT: { etiqueta: 'IVA de las planillas nuevas (%)', tipo: 'pct', max: 50 },
  EMPRESA_NOMBRE: { etiqueta: 'Nombre de la empresa (impresos)', tipo: 'texto', max: 200 },
  PLANILLA_APODERADO: { etiqueta: 'Apoderado que firma las planillas impresas', tipo: 'texto', max: 200 },
  ACCESO_MAX_INTENTOS: { etiqueta: 'Subidas permitidas por enlace de carga externo', tipo: 'entero', max: 20 },
};

class ParametroDto {
  @IsString() @MaxLength(40) clave!: string;
  @IsString() @MaxLength(200) valor!: string;
}

class GuardarParametrosDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ParametroDto)
  parametros!: ParametroDto[];
}

// ================================================================ rendimientos

class RendimientoDto {
  @IsString() @Length(1, 20) @Matches(/^[A-Za-z0-9_-]+$/, { message: 'El código solo admite letras, números, - y _' }) codigo!: string;
  @IsString() @Length(2, 150) nombre!: string;
  @IsIn(['REND', 'DOSIS']) tipo!: 'REND' | 'DOSIS';
  @IsOptional() @IsIn(['TERMO', 'TACHAS']) clase?: 'TERMO' | 'TACHAS' | null;
  @IsString() @Length(1, 40) unidad!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(1e9) factor!: number;
  @IsOptional() @IsString() @MaxLength(40) unidadBase?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(1e9) factorBase?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) minimo?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) bueno?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) ideal?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) maximo?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
  /** Materiales cuyo consumo se mide. */
  @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) materiales!: number[];
  /** Solo DOSIS: materiales base (p. ej. el termoplástico para las microesferas). */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) base?: number[];
}

@Injectable()
export class ConfigService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  async parametros() {
    const filas: { clave: string; valor: string; descripcion: string | null }[] = await this.db.query(
      `SELECT clave, valor, descripcion FROM parametros ORDER BY clave`,
    );
    return Object.entries(PARAMETROS).map(([clave, d]) => ({
      clave,
      etiqueta: d.etiqueta,
      tipo: d.tipo,
      valor: filas.find((f) => f.clave === clave)?.valor ?? '',
      descripcion: filas.find((f) => f.clave === clave)?.descripcion ?? null,
    }));
  }

  async guardarParametros(u: UsuarioSesion, dto: GuardarParametrosDto) {
    const actuales = new Map((await this.parametros()).map((p) => [p.clave, p.valor]));
    const nuevos = new Map(actuales);
    for (const p of dto.parametros) {
      const d = PARAMETROS[p.clave];
      if (!d) throw new BadRequestException(`Parámetro desconocido: ${p.clave}`);
      const v = p.valor.trim();
      if (d.tipo === 'texto') {
        if (!v || v.length > (d.max ?? 200)) throw new BadRequestException(`${d.etiqueta}: escribe un texto de hasta ${d.max} caracteres`);
      } else {
        const n = Number(v.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > (d.max ?? 1e9) || (d.tipo === 'entero' && (!Number.isInteger(n) || n < 1)))
          throw new BadRequestException(`${d.etiqueta}: valor no válido (0 a ${d.max})`);
      }
      nuevos.set(p.clave, d.tipo === 'texto' ? v : String(Number(v.replace(',', '.'))));
    }
    if (Number(nuevos.get('UMBRAL_CRITICO_PCT')) <= Number(nuevos.get('UMBRAL_ALERTA_PCT')))
      throw new BadRequestException('La tolerancia de alerta debe ser mayor que la de «dentro de lo programado»');
    const cambios = [...nuevos].filter(([k, v]) => actuales.get(k) !== v).map(([k, v]) => ({ campo: PARAMETROS[k].etiqueta, antes: actuales.get(k) || null, despues: v }));
    if (!cambios.length) return this.parametros();
    await enTransaccion(this.db, u.id, async (m) => {
      for (const [k, v] of nuevos)
        if (actuales.get(k) !== v)
          await m.query(
            `INSERT INTO parametros (clave, valor, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
            [k, v],
          );
      await this.bitacora.registrar({ accion: 'Cambió los parámetros', cambios, usuarioId: u.id, modulo: 'CONFIG' }, m);
    });
    return this.parametros();
  }

  // ---------- rendimientos
  rendimientos() {
    return this.db.query(
      `SELECT r.id, r.codigo, r.nombre, r.tipo, r.clase, r.unidad, r.factor::float, r.unidad_base AS "unidadBase",
              r.factor_base::float AS "factorBase", r.minimo::float, r.bueno::float, r.ideal::float, r.maximo::float, r.activo,
              COALESCE(array_agg(m.material_id ORDER BY m.material_id) FILTER (WHERE m.rol = 'MAT'), '{}') AS materiales,
              COALESCE(array_agg(m.material_id ORDER BY m.material_id) FILTER (WHERE m.rol = 'BASE'), '{}') AS base
         FROM rendimientos r LEFT JOIN rendimiento_materiales m ON m.rendimiento_id = r.id
        GROUP BY r.id ORDER BY r.activo DESC, r.id`,
    );
  }

  async crearRendimiento(u: UsuarioSesion, d: RendimientoDto) {
    validarRend(d);
    return enTransaccion(this.db, u.id, async (m) => {
      const [x] = await m.query(`SELECT 1 FROM rendimientos WHERE lower(codigo) = lower($1)`, [d.codigo]);
      if (x) throw new ConflictException(`Ya existe un rendimiento con código ${d.codigo}`);
      const [{ id }] = await m.query(
        `INSERT INTO rendimientos (codigo, nombre, tipo, clase, unidad, factor, unidad_base, factor_base, minimo, bueno, ideal, maximo, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13, TRUE)) RETURNING id`,
        valoresRend(d),
      );
      await this.materialesRend(m, id, d);
      await this.bitacora.registrar({ accion: 'Catálogo: creó rendimiento', detalle: d.nombre, usuarioId: u.id, modulo: 'CONFIG' }, m);
      return { id };
    });
  }

  async actualizarRendimiento(u: UsuarioSesion, id: number, d: RendimientoDto) {
    validarRend(d);
    return enTransaccion(this.db, u.id, async (m) => {
      const [a] = (await this.rendimientos()).filter((r: { id: number }) => r.id === id);
      if (!a) throw new NotFoundException('Rendimiento no encontrado');
      const [x] = await m.query(`SELECT 1 FROM rendimientos WHERE lower(codigo) = lower($1) AND id <> $2`, [d.codigo, id]);
      if (x) throw new ConflictException(`Ya existe un rendimiento con código ${d.codigo}`);
      await m.query(
        `UPDATE rendimientos SET codigo=$1, nombre=$2, tipo=$3, clase=$4, unidad=$5, factor=$6, unidad_base=$7, factor_base=$8,
                minimo=$9, bueno=$10, ideal=$11, maximo=$12, activo=COALESCE($13, activo) WHERE id=$14`,
        [...valoresRend(d), id],
      );
      await m.query(`DELETE FROM rendimiento_materiales WHERE rendimiento_id = $1`, [id]);
      await this.materialesRend(m, id, d);
      const cambios = BitacoraService.diferencias(a, { ...d, base: d.tipo === 'DOSIS' ? d.base : [] }, {
        nombre: 'Nombre', tipo: 'Tipo', clase: 'Clase', unidad: 'Unidad', factor: 'Factor', unidadBase: 'Unidad base', factorBase: 'Factor base',
        minimo: 'Mínimo', bueno: 'Bueno', ideal: 'Ideal', maximo: 'Máximo', activo: 'Activo', materiales: 'Materiales', base: 'Materiales base',
      });
      if (cambios.length)
        await this.bitacora.registrar({ accion: 'Catálogo: editó rendimiento', detalle: d.nombre, cambios, usuarioId: u.id, modulo: 'CONFIG' }, m);
      return { id };
    });
  }

  private async materialesRend(m: EntityManager, id: number, d: RendimientoDto) {
    const filas: [number, 'MAT' | 'BASE'][] = [
      ...[...new Set(d.materiales)].map((x): [number, 'MAT'] => [x, 'MAT']),
      ...(d.tipo === 'DOSIS' ? [...new Set(d.base ?? [])].map((x): [number, 'BASE'] => [x, 'BASE']) : []),
    ];
    for (const [mat, rol] of filas) {
      const [ok] = await m.query(`SELECT 1 FROM materiales WHERE id = $1`, [mat]);
      if (!ok) throw new BadRequestException('Hay materiales que no existen');
      await m.query(`INSERT INTO rendimiento_materiales (rendimiento_id, material_id, rol) VALUES ($1, $2, $3)`, [id, mat, rol]);
    }
  }
}

function validarRend(d: RendimientoDto) {
  if (!d.materiales.length) throw new BadRequestException('Elige al menos un material');
  if (d.tipo === 'REND' && !d.clase) throw new BadRequestException('Indica qué producción mide (termoplástico o tachas)');
  if (d.tipo === 'DOSIS' && (!d.factorBase || !d.base?.length || !d.unidadBase?.trim()))
    throw new BadRequestException('La dosis necesita materiales base, su unidad y su factor');
  const orden = [d.minimo, d.bueno, d.ideal, d.maximo].filter((x): x is number => x != null);
  for (let i = 1; i < orden.length; i++)
    if (orden[i] < orden[i - 1]) throw new BadRequestException('Los valores deben ir de menor a mayor: mínimo ≤ bueno ≤ ideal ≤ máximo');
}

function valoresRend(d: RendimientoDto) {
  const dosis = d.tipo === 'DOSIS';
  return [
    d.codigo.trim(), d.nombre.trim(), d.tipo, dosis ? null : d.clase, d.unidad.trim(), d.factor,
    dosis ? d.unidadBase!.trim() : null, dosis ? d.factorBase : null,
    d.minimo ?? null, d.bueno ?? null, d.ideal ?? null, d.maximo ?? null, d.activo ?? null,
  ];
}

@Controller('catalogo')
export class ConfigController {
  constructor(private readonly s: ConfigService) {}

  @Get('parametros') @Permisos('config.editar')
  parametros() { return this.s.parametros(); }
  @Put('parametros') @Permisos('config.editar')
  guardarParametros(@Body() d: GuardarParametrosDto, @CurrentUser() u: UsuarioSesion) { return this.s.guardarParametros(u, d); }

  @Get('rendimientos') @Permisos('config.editar')
  rendimientos() { return this.s.rendimientos(); }
  @Post('rendimientos') @Permisos('config.editar')
  crearRendimiento(@Body() d: RendimientoDto, @CurrentUser() u: UsuarioSesion) { return this.s.crearRendimiento(u, d); }
  @Patch('rendimientos/:id') @Permisos('config.editar')
  actualizarRendimiento(@Param('id', ParseIntPipe) id: number, @Body() d: RendimientoDto, @CurrentUser() u: UsuarioSesion) {
    return this.s.actualizarRendimiento(u, id, d);
  }
}

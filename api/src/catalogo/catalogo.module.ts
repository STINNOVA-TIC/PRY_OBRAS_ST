import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import type { Response } from 'express';
import { DataSource, EntityManager } from 'typeorm';
import { BitacoraService } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import {
  COLS_MATERIAL,
  COLS_RUBRO,
  LIMITE_EXCEL,
  MIME_XLSX,
  exigirXlsx,
  filasMaterial,
  filasRubro,
  generarExcel,
  leerTablaExcel,
  normalizar,
} from '../common/excel.js';
import { enTransaccion } from '../common/transaccion.js';
import { FirmasService } from '../firmas/firmas.service.js';
import { ConfigController, ConfigService } from './config.js';

// ---------------------------------------------------------------- DTO
class MaterialDto {
  @IsString() @Length(1, 20) @Matches(/^[A-Za-z0-9._-]+$/, { message: 'El código solo admite letras, números, punto, guion y guion bajo' })
  codigo!: string;
  @IsString() @Length(2, 150) nombre!: string;
  @IsString() @Length(1, 20) unidad!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) costoUnitario?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) stockMinimo?: number;
}
class ActualizarMaterialDto {
  @IsOptional() @IsString() @Length(2, 150) nombre?: string;
  @IsOptional() @IsString() @Length(1, 20) unidad?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) costoUnitario?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) stockMinimo?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}

class InsumoCatDto {
  @IsInt() @Min(1) materialId!: number;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) cantidadPorUnidad!: number;
}
class RubroCatDto {
  @IsOptional() @IsString() @MaxLength(30) codigo?: string | null;
  @IsString() @Length(3, 300) descripcion!: string;
  @IsString() @Length(1, 20) unidad!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) puRef?: number;
  @IsOptional() @IsIn(['TERMO', 'TACHAS']) clase?: 'TERMO' | 'TACHAS' | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => InsumoCatDto) insumos?: InsumoCatDto[];
}
class ActualizarRubroCatDto {
  @IsOptional() @IsString() @MaxLength(30) codigo?: string | null;
  @IsOptional() @IsString() @Length(3, 300) descripcion?: string;
  @IsOptional() @IsString() @Length(1, 20) unidad?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) puRef?: number;
  @IsOptional() @IsIn(['TERMO', 'TACHAS']) clase?: 'TERMO' | 'TACHAS' | null;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => InsumoCatDto) insumos?: InsumoCatDto[];
}

class DocumentoDto {
  @IsString() @Length(3, 150) nombre!: string;
  /** Si exige fecha de vencimiento (certificados mensuales, pólizas…). */
  @IsOptional() @IsBoolean() vence?: boolean;
  @IsOptional() @IsString() @Length(2, 20) @Matches(/^[A-Z0-9_]+$/, { message: 'Código: mayúsculas, números o guion bajo' }) codigo?: string;
}
class ActualizarDocumentoDto {
  @IsOptional() @IsString() @Length(3, 150) nombre?: string;
  @IsOptional() @IsBoolean() vence?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) orden?: number;
}

class FilaImportRubroCat {
  @IsOptional() @IsString() @MaxLength(30) codigo?: string | null;
  @IsString() @Length(3, 300) descripcion!: string;
  @IsString() @Length(1, 20) unidad!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) precioUnitario?: number | null;
}
class ImportRubrosCatDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => FilaImportRubroCat)
  filas!: FilaImportRubroCat[];
}
class FilaImportMaterial {
  @IsString() @Length(1, 20) codigo!: string;
  @IsString() @Length(2, 150) nombre!: string;
  @IsString() @Length(1, 20) unidad!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) costoUnitario?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) stockMinimo?: number | null;
}
class ImportMaterialesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => FilaImportMaterial)
  filas!: FilaImportMaterial[];
}

// ---------------------------------------------------------------- servicio
@Injectable()
export class CatalogoService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
    private readonly firmas: FirmasService,
  ) {}

  // ---------- materiales
  materiales() {
    return this.db.query(
      `SELECT m.id, m.codigo, m.nombre, m.unidad, m.costo_unitario::float AS "costoUnitario", m.stock_minimo::float AS "stockMinimo", m.activo,
              (SELECT COUNT(*)::int FROM catalogo_rubro_insumos i WHERE i.material_id = m.id)
              + (SELECT COUNT(*)::int FROM obra_rubro_insumos i WHERE i.material_id = m.id) AS usos,
              COALESCE((SELECT SUM(s.cantidad) FROM stock s WHERE s.material_id = m.id), 0)::float AS "stockTotal"
         FROM materiales m ORDER BY m.activo DESC, m.codigo`,
    );
  }

  async crearMaterial(u: UsuarioSesion, d: MaterialDto) {
    return enTransaccion(this.db, u.id, async (m) => {
      await this.codigoLibre(m, d.codigo.toUpperCase());
      const [r] = await m.query(
        `INSERT INTO materiales (codigo, nombre, unidad, costo_unitario, stock_minimo) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [d.codigo.toUpperCase(), d.nombre.trim(), d.unidad.trim(), d.costoUnitario ?? 0, d.stockMinimo ?? 0],
      );
      await this.bitacora.registrar({ obraId: null, accion: 'Catálogo: creó material', detalle: `${d.codigo.toUpperCase()} ${d.nombre}`, usuarioId: u.id }, m);
      return { id: r.id };
    });
  }

  async actualizarMaterial(u: UsuarioSesion, id: number, d: ActualizarMaterialDto) {
    return enTransaccion(this.db, u.id, async (m) => {
      const [a] = await m.query(
        `SELECT codigo, nombre, unidad, costo_unitario::float AS "costoUnitario", stock_minimo::float AS "stockMinimo", activo FROM materiales WHERE id = $1`,
        [id],
      );
      if (!a) throw new NotFoundException('Material no encontrado');
      if (d.unidad && d.unidad.trim() !== a.unidad) {
        const [{ n }] = await m.query(`SELECT COUNT(*)::int AS n FROM movimientos_inventario WHERE material_id = $1`, [id]);
        if (n > 0) throw new ConflictException('El material ya tiene movimientos de bodega: no se puede cambiar su unidad');
      }
      await m.query(
        `UPDATE materiales SET nombre = COALESCE($2, nombre), unidad = COALESCE($3, unidad), costo_unitario = COALESCE($4, costo_unitario),
                stock_minimo = COALESCE($5, stock_minimo), activo = COALESCE($6, activo) WHERE id = $1`,
        [id, d.nombre?.trim() ?? null, d.unidad?.trim() ?? null, d.costoUnitario ?? null, d.stockMinimo ?? null, d.activo ?? null],
      );
      const cambios = BitacoraService.diferencias(a, d, { nombre: 'Nombre', unidad: 'Unidad', costoUnitario: 'Costo unitario', stockMinimo: 'Stock mínimo', activo: 'Activo' });
      if (cambios.length)
        await this.bitacora.registrar({ obraId: null, accion: 'Catálogo: editó material', detalle: a.codigo, cambios, usuarioId: u.id }, m);
      return { id };
    });
  }

  private async codigoLibre(m: EntityManager, codigo: string) {
    const [x] = await m.query(`SELECT 1 FROM materiales WHERE upper(codigo) = upper($1)`, [codigo]);
    if (x) throw new ConflictException(`Ya existe un material con código ${codigo}`);
  }

  /** Alta o actualización masiva por código (nombre, unidad si no tiene movimientos, costo, mínimo). */
  async importarMateriales(u: UsuarioSesion, filas: FilaImportMaterial[]) {
    const codigos = filas.map((f) => f.codigo.toUpperCase());
    if (new Set(codigos).size !== codigos.length) throw new BadRequestException('Hay códigos repetidos en el archivo');
    return enTransaccion(this.db, u.id, async (m) => {
      let creados = 0;
      let actualizados = 0;
      for (const f of filas) {
        const codigo = f.codigo.toUpperCase();
        const [a] = await m.query(`SELECT id FROM materiales WHERE upper(codigo) = $1`, [codigo]);
        if (a) {
          await m.query(
            `UPDATE materiales SET nombre = $2, costo_unitario = COALESCE($3, costo_unitario), stock_minimo = COALESCE($4, stock_minimo), activo = TRUE,
                    unidad = CASE WHEN EXISTS (SELECT 1 FROM movimientos_inventario WHERE material_id = $1) THEN unidad ELSE $5 END
              WHERE id = $1`,
            [a.id, f.nombre.trim(), f.costoUnitario ?? null, f.stockMinimo ?? null, f.unidad.trim()],
          );
          actualizados++;
        } else {
          await m.query(`INSERT INTO materiales (codigo, nombre, unidad, costo_unitario, stock_minimo) VALUES ($1,$2,$3,$4,$5)`, [
            codigo, f.nombre.trim(), f.unidad.trim(), f.costoUnitario ?? 0, f.stockMinimo ?? 0,
          ]);
          creados++;
        }
      }
      await this.bitacora.registrar({ obraId: null, accion: 'Catálogo: importó materiales', detalle: `${creados} nuevo(s), ${actualizados} actualizado(s)`, usuarioId: u.id }, m);
      return { creados, actualizados };
    });
  }

  async exportarMateriales() {
    const l: { codigo: string; nombre: string; unidad: string; costoUnitario: number; stockMinimo: number; activo: boolean; stockTotal: number }[] = await this.materiales();
    return generarExcel(
      'Materiales',
      [{ titulo: 'CODIGO', ancho: 14 }, { titulo: 'DESCRIPCION', ancho: 60 }, { titulo: 'UNIDAD', ancho: 10 }, { titulo: 'COSTO UNITARIO', numero: true }, { titulo: 'STOCK MINIMO', numero: true }, { titulo: 'STOCK TOTAL', numero: true }, { titulo: 'ACTIVO', ancho: 8 }],
      l.map((x) => [x.codigo, x.nombre, x.unidad, x.costoUnitario, x.stockMinimo, x.stockTotal, x.activo ? 'SI' : 'NO']),
    );
  }

  // ---------- rubros del catálogo
  rubros() {
    return this.db.query(
      `SELECT r.id, r.codigo, r.descripcion, r.unidad, r.pu_ref::float AS "puRef", r.clase, r.activo,
              (SELECT COUNT(*)::int FROM obra_rubros o WHERE o.catalogo_rubro_id = r.id) AS usos,
              COALESCE((SELECT json_agg(json_build_object('materialId', m.id, 'codigo', m.codigo, 'nombre', m.nombre, 'unidad', m.unidad,
                          'cantidadPorUnidad', i.cantidad_por_unidad::float) ORDER BY m.codigo)
                          FROM catalogo_rubro_insumos i JOIN materiales m ON m.id = i.material_id WHERE i.catalogo_rubro_id = r.id), '[]') AS insumos
         FROM catalogo_rubros r ORDER BY r.activo DESC, r.codigo NULLS LAST, r.descripcion`,
    );
  }

  async crearRubro(u: UsuarioSesion, d: RubroCatDto) {
    return enTransaccion(this.db, u.id, async (m) => {
      const [r] = await m.query(
        `INSERT INTO catalogo_rubros (codigo, descripcion, unidad, pu_ref, clase) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [d.codigo?.trim() || null, d.descripcion.trim(), d.unidad.trim(), d.puRef ?? 0, d.clase ?? null],
      );
      await this.guardarInsumos(m, r.id, d.insumos ?? []);
      await this.bitacora.registrar({ obraId: null, accion: 'Catálogo: creó rubro', detalle: d.descripcion, usuarioId: u.id }, m);
      return { id: r.id };
    });
  }

  async actualizarRubro(u: UsuarioSesion, id: number, d: ActualizarRubroCatDto) {
    return enTransaccion(this.db, u.id, async (m) => {
      const [a] = await m.query(`SELECT codigo, descripcion, unidad, pu_ref::float AS "puRef", clase, activo FROM catalogo_rubros WHERE id = $1`, [id]);
      if (!a) throw new NotFoundException('Rubro del catálogo no encontrado');
      await m.query(
        `UPDATE catalogo_rubros SET codigo = $2, descripcion = $3, unidad = $4, pu_ref = $5, clase = $6, activo = $7 WHERE id = $1`,
        [
          id,
          d.codigo !== undefined ? d.codigo?.trim() || null : a.codigo,
          d.descripcion?.trim() ?? a.descripcion,
          d.unidad?.trim() ?? a.unidad,
          d.puRef ?? a.puRef,
          d.clase !== undefined ? d.clase : a.clase,
          d.activo ?? a.activo,
        ],
      );
      if (d.insumos) await this.guardarInsumos(m, id, d.insumos);
      const cambios = BitacoraService.diferencias(a, d, { codigo: 'Código', descripcion: 'Descripción', unidad: 'Unidad', puRef: 'Precio de referencia', clase: 'Clase', activo: 'Activo' });
      if (cambios.length || d.insumos)
        await this.bitacora.registrar({ obraId: null, accion: 'Catálogo: editó rubro', detalle: a.descripcion + (d.insumos ? ' (insumos)' : ''), cambios, usuarioId: u.id }, m);
      return { id };
    });
  }

  private async guardarInsumos(m: EntityManager, rubroId: number, insumos: InsumoCatDto[]) {
    const ids = insumos.map((i) => i.materialId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un material está repetido en los insumos');
    if (ids.length) {
      const ok: { id: number }[] = await m.query(`SELECT id FROM materiales WHERE id = ANY($1) AND activo`, [ids]);
      if (ok.length !== ids.length) throw new BadRequestException('Hay materiales no válidos en los insumos');
    }
    await m.query(`DELETE FROM catalogo_rubro_insumos WHERE catalogo_rubro_id = $1`, [rubroId]);
    for (const i of insumos)
      await m.query(`INSERT INTO catalogo_rubro_insumos (catalogo_rubro_id, material_id, cantidad_por_unidad) VALUES ($1,$2,$3)`, [rubroId, i.materialId, i.cantidadPorUnidad]);
  }

  /** Alta o actualización masiva: coincide por código (si lo trae) o por descripción + unidad. Las obras existentes no cambian. */
  async importarRubros(u: UsuarioSesion, filas: FilaImportRubroCat[]) {
    return enTransaccion(this.db, u.id, async (m) => {
      let creados = 0;
      let actualizados = 0;
      for (const f of filas) {
        const codigo = f.codigo?.trim() || null;
        const [a] = codigo
          ? await m.query(`SELECT id FROM catalogo_rubros WHERE upper(codigo) = upper($1) LIMIT 1`, [codigo])
          : await m.query(`SELECT id FROM catalogo_rubros WHERE lower(descripcion) = lower($1) AND lower(unidad) = lower($2) LIMIT 1`, [f.descripcion.trim(), f.unidad.trim()]);
        if (a) {
          await m.query(
            `UPDATE catalogo_rubros SET descripcion = $2, unidad = $3, pu_ref = COALESCE($4, pu_ref), activo = TRUE WHERE id = $1`,
            [a.id, f.descripcion.trim(), f.unidad.trim(), f.precioUnitario ?? null],
          );
          actualizados++;
        } else {
          await m.query(`INSERT INTO catalogo_rubros (codigo, descripcion, unidad, pu_ref, clase) VALUES ($1,$2,$3,$4,$5)`, [
            codigo, f.descripcion.trim(), f.unidad.trim(), f.precioUnitario ?? 0, claseAuto(f.descripcion),
          ]);
          creados++;
        }
      }
      await this.bitacora.registrar({ obraId: null, accion: 'Catálogo: importó rubros', detalle: `${creados} nuevo(s), ${actualizados} actualizado(s)`, usuarioId: u.id }, m);
      return { creados, actualizados };
    });
  }

  async exportarRubros() {
    const l: { codigo: string | null; descripcion: string; unidad: string; puRef: number; clase: string | null; activo: boolean; insumos: { codigo: string; cantidadPorUnidad: number }[] }[] = await this.rubros();
    return generarExcel(
      'Catálogo de rubros',
      [{ titulo: 'CODIGO', ancho: 14 }, { titulo: 'DESCRIPCION', ancho: 70 }, { titulo: 'UNIDAD', ancho: 10 }, { titulo: 'P. UNIT', numero: true }, { titulo: 'CLASE', ancho: 10 }, { titulo: 'INSUMOS POR UNIDAD', ancho: 40 }, { titulo: 'ACTIVO', ancho: 8 }],
      l.map((r) => [r.codigo, r.descripcion, r.unidad, r.puRef, r.clase, r.insumos.map((i) => `${i.codigo}: ${i.cantidadPorUnidad}`).join('; '), r.activo ? 'SI' : 'NO']),
    );
  }

  // ---------- documentos habilitantes de contratistas
  documentos() {
    return this.db.query(
      `SELECT t.id, t.codigo, t.nombre, t.vence, t.orden, t.activo,
              (SELECT COUNT(*)::int FROM contratista_documentos d WHERE d.tipo_id = t.id) AS usos
         FROM tipos_documento_contratista t ORDER BY t.activo DESC, t.orden, t.id`,
    );
  }

  async crearDocumento(u: UsuarioSesion, d: DocumentoDto) {
    return enTransaccion(this.db, u.id, async (m) => {
      const base = d.codigo ?? (normalizar(d.nombre).slice(0, 16) || 'DOC');
      let codigo = base;
      for (let i = 2; (await m.query(`SELECT 1 FROM tipos_documento_contratista WHERE codigo = $1`, [codigo])).length; i++) {
        if (d.codigo) throw new ConflictException(`Ya existe un documento con código ${d.codigo}`);
        codigo = `${base.slice(0, 17)}_${i}`;
      }
      const [r] = await m.query(
        `INSERT INTO tipos_documento_contratista (codigo, nombre, vence, orden)
         VALUES ($1, $2, $3, COALESCE((SELECT MAX(orden) + 1 FROM tipos_documento_contratista), 1)) RETURNING id`,
        [codigo, d.nombre.trim(), d.vence ?? false],
      );
      const reiniciadas = await this.reiniciarHabilitaciones(m);
      await this.bitacora.registrar({
        obraId: null,
        accion: 'Catálogo: creó documento habilitante',
        detalle: `${d.nombre.trim()}${d.vence ? ' (vence)' : ''}${reiniciadas ? `. Se reiniciaron firmas de ${reiniciadas} habilitación(es) en curso` : ''}`,
        usuarioId: u.id,
      }, m);
      return { id: r.id, codigo, firmasReiniciadas: reiniciadas };
    });
  }

  async actualizarDocumento(u: UsuarioSesion, id: number, d: ActualizarDocumentoDto) {
    return enTransaccion(this.db, u.id, async (m) => {
      const [a] = await m.query(`SELECT codigo, nombre, vence, orden, activo FROM tipos_documento_contratista WHERE id = $1`, [id]);
      if (!a) throw new NotFoundException('Documento no encontrado');
      if (d.activo === false) {
        const [{ n }] = await m.query(`SELECT COUNT(*)::int AS n FROM tipos_documento_contratista WHERE activo AND id <> $1`, [id]);
        if (n === 0) throw new BadRequestException('Debe quedar al menos un documento habilitante activo');
      }
      await m.query(
        `UPDATE tipos_documento_contratista SET nombre = COALESCE($2, nombre), vence = COALESCE($3, vence), activo = COALESCE($4, activo), orden = COALESCE($5, orden) WHERE id = $1`,
        [id, d.nombre?.trim() ?? null, d.vence ?? null, d.activo ?? null, d.orden ?? null],
      );
      // Cambiar lo que se exige (activar, desactivar o pedir vencimiento) afecta las habilitaciones en curso
      const cambiaExigencia = (d.activo !== undefined && d.activo !== a.activo) || (d.vence !== undefined && d.vence !== a.vence);
      const reiniciadas = cambiaExigencia ? await this.reiniciarHabilitaciones(m) : 0;
      const cambios = BitacoraService.diferencias(a, d, { nombre: 'Nombre', vence: 'Exige vencimiento', activo: 'Activo', orden: 'Orden' });
      if (cambios.length)
        await this.bitacora.registrar({
          obraId: null,
          accion: 'Catálogo: editó documento habilitante',
          detalle: a.nombre + (reiniciadas ? `. Se reiniciaron firmas de ${reiniciadas} habilitación(es) en curso` : ''),
          cambios,
          usuarioId: u.id,
        }, m);
      return { id, firmasReiniciadas: reiniciadas };
    });
  }

  /** Lo exigido cambió: las habilitaciones en curso vuelven a necesitar sus firmas (regla de la fase 2). */
  private async reiniciarHabilitaciones(m: EntityManager) {
    const obras: { id: string }[] = await m.query(`SELECT id FROM obras WHERE estado = 'HABILITACION' AND eliminado_en IS NULL`);
    let n = 0;
    for (const o of obras) if ((await this.firmas.reiniciar(m, 'HABILITACION', o.id)) > 0) n++;
    return n;
  }
}

/** «tacha» → TACHAS, «termo» → TERMO (igual que en las obras). */
function claseAuto(descripcion: string): 'TERMO' | 'TACHAS' | null {
  const d = descripcion.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /tacha/.test(d) ? 'TACHAS' : /termo/.test(d) ? 'TERMO' : null;
}

// ---------------------------------------------------------------- controlador
const enviarExcel = (res: Response, buf: Buffer, nombre: string) => {
  res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
  return new StreamableFile(buf);
};

@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly s: CatalogoService) {}

  // materiales
  @Get('materiales') @Permisos('config.editar')
  materiales() { return this.s.materiales(); }
  @Post('materiales') @Permisos('config.editar')
  crearMaterial(@Body() d: MaterialDto, @CurrentUser() u: UsuarioSesion) { return this.s.crearMaterial(u, d); }
  @Patch('materiales/:id') @Permisos('config.editar')
  actualizarMaterial(@Param('id', ParseIntPipe) id: number, @Body() d: ActualizarMaterialDto, @CurrentUser() u: UsuarioSesion) { return this.s.actualizarMaterial(u, id, d); }
  @Get('materiales/exportar') @Permisos('config.editar')
  async exportarMateriales(@Res({ passthrough: true }) res: Response) { return enviarExcel(res, await this.s.exportarMateriales(), 'materiales.xlsx'); }
  /** Lee el Excel y devuelve las filas con sus errores (no guarda nada). */
  @Post('materiales/importar/leer') @Permisos('config.editar') @UseInterceptors(FileInterceptor('archivo', LIMITE_EXCEL))
  async leerMateriales(@UploadedFile() archivo: { buffer: Buffer; size: number }) {
    return { filas: filasMaterial(await leerTablaExcel(exigirXlsx(archivo), COLS_MATERIAL), false) };
  }
  @Post('materiales/importar') @Permisos('config.editar')
  importarMateriales(@Body() d: ImportMaterialesDto, @CurrentUser() u: UsuarioSesion) { return this.s.importarMateriales(u, d.filas); }

  // rubros del catálogo
  @Get('rubros') @Permisos('config.editar')
  rubros() { return this.s.rubros(); }
  @Post('rubros') @Permisos('config.editar')
  crearRubro(@Body() d: RubroCatDto, @CurrentUser() u: UsuarioSesion) { return this.s.crearRubro(u, d); }
  @Patch('rubros/:id') @Permisos('config.editar')
  actualizarRubro(@Param('id', ParseIntPipe) id: number, @Body() d: ActualizarRubroCatDto, @CurrentUser() u: UsuarioSesion) { return this.s.actualizarRubro(u, id, d); }
  @Get('rubros/exportar') @Permisos('config.editar')
  async exportarRubros(@Res({ passthrough: true }) res: Response) { return enviarExcel(res, await this.s.exportarRubros(), 'catalogo-rubros.xlsx'); }
  @Post('rubros/importar/leer') @Permisos('config.editar') @UseInterceptors(FileInterceptor('archivo', LIMITE_EXCEL))
  async leerRubros(@UploadedFile() archivo: { buffer: Buffer; size: number }) {
    return { filas: filasRubro(await leerTablaExcel(exigirXlsx(archivo), COLS_RUBRO), false) };
  }
  @Post('rubros/importar') @Permisos('config.editar')
  importarRubros(@Body() d: ImportRubrosCatDto, @CurrentUser() u: UsuarioSesion) { return this.s.importarRubros(u, d.filas); }

  // documentos habilitantes
  @Get('documentos') @Permisos('config.editar')
  documentos() { return this.s.documentos(); }
  @Post('documentos') @Permisos('config.editar')
  crearDocumento(@Body() d: DocumentoDto, @CurrentUser() u: UsuarioSesion) { return this.s.crearDocumento(u, d); }
  @Patch('documentos/:id') @Permisos('config.editar')
  actualizarDocumento(@Param('id', ParseIntPipe) id: number, @Body() d: ActualizarDocumentoDto, @CurrentUser() u: UsuarioSesion) { return this.s.actualizarDocumento(u, id, d); }
}

@Module({ controllers: [CatalogoController, ConfigController], providers: [CatalogoService, ConfigService] })
export class CatalogoModule {}

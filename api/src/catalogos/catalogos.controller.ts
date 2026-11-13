import { Controller, Get, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Catálogos de configuración (lectura). Cualquier usuario autenticado los necesita
 * para armar formularios. La edición llega en la fase de configuración.
 */
@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly db: DataSource) {}

  @Get()
  async todos() {
    const [
      materiales,
      rubros,
      rendimientos,
      tiposRequisito,
      tiposDocumento,
      parametros,
      bodegas,
    ] = await Promise.all([
      this.db.query(
        `SELECT id, codigo, nombre, unidad, costo_unitario::float AS "costoUnitario", stock_minimo::float AS "stockMinimo", activo
           FROM materiales ORDER BY codigo`,
      ),
      this.db.query(
        `SELECT r.id, r.codigo, r.descripcion, r.unidad, r.pu_ref::float AS "puRef", r.clase, r.activo,
                COALESCE(json_agg(json_build_object('materialId', i.material_id, 'cantidadPorUnidad', i.cantidad_por_unidad::float))
                         FILTER (WHERE i.material_id IS NOT NULL), '[]') AS insumos
           FROM catalogo_rubros r LEFT JOIN catalogo_rubro_insumos i ON i.catalogo_rubro_id = r.id
          GROUP BY r.id ORDER BY r.codigo NULLS LAST, r.id`,
      ),
      this.db.query(
        `SELECT r.id, r.codigo, r.nombre, r.tipo, r.clase, r.unidad, r.factor::float, r.unidad_base AS "unidadBase",
                r.factor_base::float AS "factorBase", r.minimo::float, r.bueno::float, r.ideal::float, r.maximo::float, r.activo,
                COALESCE(json_agg(json_build_object('materialId', m.material_id, 'rol', m.rol)) FILTER (WHERE m.material_id IS NOT NULL), '[]') AS materiales
           FROM rendimientos r LEFT JOIN rendimiento_materiales m ON m.rendimiento_id = r.id
          GROUP BY r.id ORDER BY r.id`,
      ),
      this.db.query(
        `SELECT id, codigo, nombre, texto_confirmacion AS "textoConfirmacion", etiqueta_ref AS "etiquetaRef",
                etiqueta_fecha AS "etiquetaFecha", etiqueta_adjunto AS "etiquetaAdjunto", es_monto AS "esMonto", orden
           FROM tipos_requisito WHERE activo ORDER BY orden`,
      ),
      this.db.query(
        `SELECT id, codigo, nombre, vence, orden FROM tipos_documento_contratista WHERE activo ORDER BY orden`,
      ),
      this.db.query(
        `SELECT clave, valor, descripcion FROM parametros ORDER BY clave`,
      ),
      this.db.query(
        `SELECT id, codigo, nombre, tipo, obra_id AS "obraId" FROM bodegas WHERE activo ORDER BY tipo, nombre`,
      ),
    ]);
    return {
      materiales,
      rubros,
      rendimientos,
      tiposRequisito,
      tiposDocumento,
      parametros,
      bodegas,
    };
  }
}

@Module({ controllers: [CatalogosController] })
export class CatalogosModule {}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Global,
  Injectable,
  Module,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from '../common/decorators.js';

export type EntidadFirmable = 'HABILITACION' | 'PLANILLA' | 'TRANSFERENCIA';

export interface PasoFirma {
  rol: string;
  etiqueta: string;
  orden: number;
  designadoId: string | null;
}

export interface FirmaDetalle {
  id: string;
  rol: string;
  etiqueta: string;
  orden: number;
  designadoId: string | null;
  designadoNombre: string | null;
  designadoTieneFirma: boolean;
  firmado: boolean;
  firmadoPor: string | null;
  firmaArchivoId: string | null;
  nombreFirmante: string | null;
  cargoFirmante: string | null;
  firmadoEn: string | null;
  esReemplazo: boolean;
  motivo: string | null;
}

/**
 * Firmas de documentos con el patrón del Punto de Venta:
 *  - cada documento tiene pasos firmables con un firmante designado;
 *  - solo el designado firma (salvo reemplazo autorizado) y debe tener su firma registrada;
 *  - al firmar se estampa la imagen de la firma, nombre, cargo y fecha del momento;
 *  - si el documento cambia, las firmas se reinician.
 */
@Injectable()
export class FirmasService {
  constructor(private readonly db: DataSource) {}

  /** Crea los pasos que falten y actualiza el designado de los que aún no se firmaron. */
  async asegurar(
    m: EntityManager,
    tipo: EntidadFirmable,
    entidadId: string,
    pasos: PasoFirma[],
  ) {
    for (const p of pasos) {
      await m.query(
        `INSERT INTO firmas (entidad_tipo, entidad_id, rol_firma, etiqueta, orden, designado_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (entidad_tipo, entidad_id, rol_firma) DO UPDATE
           SET etiqueta = EXCLUDED.etiqueta,
               designado_id = CASE WHEN firmas.firmado_en IS NULL THEN EXCLUDED.designado_id ELSE firmas.designado_id END
           WHERE firmas.etiqueta IS DISTINCT FROM EXCLUDED.etiqueta
              OR (firmas.firmado_en IS NULL AND firmas.designado_id IS DISTINCT FROM EXCLUDED.designado_id)`,
        [tipo, entidadId, p.rol, p.etiqueta, p.orden, p.designadoId],
      );
    }
  }

  async listar(
    db: DataSource | EntityManager,
    tipo: EntidadFirmable,
    entidadId: string,
  ): Promise<FirmaDetalle[]> {
    return db.query(
      `SELECT f.id, f.rol_firma AS rol, f.etiqueta, f.orden, f.designado_id AS "designadoId",
              d.nombre AS "designadoNombre", (d.firma_archivo_id IS NOT NULL) AS "designadoTieneFirma",
              (f.firmado_en IS NOT NULL) AS firmado, f.firmado_por AS "firmadoPor",
              f.firma_archivo_id AS "firmaArchivoId", f.nombre_firmante AS "nombreFirmante",
              f.cargo_firmante AS "cargoFirmante", f.firmado_en AS "firmadoEn",
              f.es_reemplazo AS "esReemplazo", f.motivo
         FROM firmas f LEFT JOIN usuarios d ON d.id = f.designado_id
        WHERE f.entidad_tipo = $1 AND f.entidad_id = $2
        ORDER BY f.orden`,
      [tipo, entidadId],
    );
  }

  /**
   * Estampa la firma del usuario en el paso indicado.
   * `reemplazo`: firma en nombre del designado (requiere motivo; la autorización la valida quien llama).
   */
  async firmar(
    m: EntityManager,
    tipo: EntidadFirmable,
    entidadId: string,
    rol: string,
    u: UsuarioSesion,
    reemplazo?: { motivo: string },
    /** Pasos que la misma persona sí puede firmar además de este (p. ej. quien solicita también recibe). */
    compatibles: string[] = [],
  ): Promise<FirmaDetalle[]> {
    const [paso] = await m.query(
      `SELECT id, designado_id, firmado_en FROM firmas
        WHERE entidad_tipo = $1 AND entidad_id = $2 AND rol_firma = $3 FOR UPDATE`,
      [tipo, entidadId, rol],
    );
    if (!paso) throw new NotFoundException('Paso de firma no encontrado');
    if (paso.firmado_en)
      throw new ConflictException('Este paso ya fue firmado');
    if (!reemplazo) {
      if (!paso.designado_id)
        throw new BadRequestException(
          'Aún no se designa quién firma este paso',
        );
      if (paso.designado_id !== u.id)
        throw new ForbiddenException(
          'No estás designado para firmar este paso',
        );
    }

    const [yo] = await m.query(
      `SELECT nombre, cargo, firma_archivo_id FROM usuarios WHERE id = $1`,
      [u.id],
    );
    if (!yo?.firma_archivo_id) {
      throw new BadRequestException(
        'No tienes una firma registrada. Súbela en «Mi perfil y firma» antes de firmar.',
      );
    }

    // Una persona no firma dos pasos del mismo documento (salvo los declarados compatibles)
    const [otro] = await m.query(
      `SELECT etiqueta FROM firmas WHERE entidad_tipo = $1 AND entidad_id = $2 AND firmado_por = $3
          AND rol_firma <> $4 AND NOT (rol_firma = ANY($5))`,
      [tipo, entidadId, u.id, rol, compatibles],
    );
    if (otro)
      throw new ForbiddenException(
        `Ya firmaste este documento como «${otro.etiqueta}»`,
      );

    await m.query(
      `UPDATE firmas SET firmado_por = $1, firma_archivo_id = $2, nombre_firmante = $3, cargo_firmante = $4,
              firmado_en = now(), es_reemplazo = $5, motivo = $6
        WHERE id = $7`,
      [
        u.id,
        yo.firma_archivo_id,
        yo.nombre,
        yo.cargo,
        !!reemplazo,
        reemplazo?.motivo ?? null,
        paso.id,
      ],
    );
    return this.listar(m, tipo, entidadId);
  }

  /** Borra todas las firmas estampadas del documento. Devuelve cuántas había. */
  async reiniciar(
    m: EntityManager,
    tipo: EntidadFirmable,
    entidadId: string,
  ): Promise<number> {
    const [{ n }] = await m.query(
      `SELECT COUNT(*)::int AS n FROM firmas WHERE entidad_tipo = $1 AND entidad_id = $2 AND firmado_en IS NOT NULL`,
      [tipo, entidadId],
    );
    if (n > 0) {
      await m.query(
        `UPDATE firmas SET firmado_por = NULL, firma_archivo_id = NULL, nombre_firmante = NULL, cargo_firmante = NULL,
                firmado_en = NULL, es_reemplazo = FALSE, motivo = NULL
          WHERE entidad_tipo = $1 AND entidad_id = $2`,
        [tipo, entidadId],
      );
    }
    return n;
  }
}

@Global()
@Module({ providers: [FirmasService], exports: [FirmasService] })
export class FirmasModule {}

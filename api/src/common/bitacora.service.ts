import { Global, Injectable, Module } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { contexto } from './contexto.js';

export interface CambioBitacora {
  campo: string;
  antes: unknown;
  despues: unknown;
}

export const MODULOS_BITACORA = [
  'OBRAS',
  'HABILITACION',
  'RUBROS',
  'AVANCES',
  'PROGRAMA',
  'BODEGA',
  'PLANILLAS',
  'COSTEO',
  'REPORTES',
  'CONFIG',
  'USUARIOS',
  'ACCESO',
] as const;
export type ModuloBitacora = (typeof MODULOS_BITACORA)[number];

export interface EventoBitacora {
  obraId?: string | null;
  accion: string;
  detalle?: string | null;
  cambios?: CambioBitacora[];
  /** null solo en eventos sin sesión (p. ej. un ingreso fallido). */
  usuarioId: string | null;
  /** Si no se indica se deduce de la acción. */
  modulo?: ModuloBitacora;
  /** Registro afectado, para enlazarlo desde la bitácora: PLANILLA + id, TRANSFERENCIA + id... */
  entidad?: string;
  entidadId?: string | number | null;
}

/** Deduce el módulo por las palabras de la acción (para los eventos que no lo indican). */
const REGLAS: [RegExp, ModuloBitacora][] = [
  [/planilla/i, 'PLANILLAS'],
  [/costeo|costo/i, 'COSTEO'],
  [/avance/i, 'AVANCES'],
  [/transferencia|bodega|movimiento|ingreso|consumo|ajuste|devoluci|kardex|revirti/i, 'BODEGA'],
  [/programa|cobertura/i, 'PROGRAMA'],
  [/catálogo|cat[aá]logo|material|documento habilitante|par[aá]metro|rendimiento|tolerancia/i, 'CONFIG'],
  [/rubro/i, 'RUBROS'],
  [/habilitaci|requisito|documento|contratista|firm/i, 'HABILITACION'],
  [/usuario|rol|permiso|contraseña/i, 'USUARIOS'],
];
export const moduloDe = (accion: string): ModuloBitacora => REGLAS.find(([r]) => r.test(accion))?.[1] ?? 'OBRAS';

/** Bitácora de negocio (legible): "Registró avance", "Firmó la habilitación"... con quién, desde dónde y qué cambió. */
@Injectable()
export class BitacoraService {
  constructor(private readonly db: DataSource) {}

  registrar(e: EventoBitacora, m?: EntityManager) {
    const ctx = contexto.getStore();
    return (m ?? this.db).query(
      `INSERT INTO bitacora (obra_id, accion, detalle, cambios, usuario_id, modulo, entidad, entidad_id, ip, agente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        e.obraId ?? null,
        e.accion.slice(0, 120),
        e.detalle ?? null,
        JSON.stringify((e.cambios ?? []).map(normalizar)),
        e.usuarioId,
        e.modulo ?? moduloDe(e.accion),
        e.entidad ?? null,
        e.entidadId != null ? String(e.entidadId) : null,
        ctx?.ip ?? null,
        ctx?.agente ?? null,
      ],
    );
  }

  /** Compara dos objetos y devuelve los campos que cambiaron (solo los indicados). */
  static diferencias<T extends object>(
    antes: T,
    despues: Partial<T>,
    etiquetas: Partial<Record<keyof T, string>>,
  ): CambioBitacora[] {
    return (Object.keys(etiquetas) as (keyof T)[])
      .filter((k) => despues[k] !== undefined && texto(despues[k]) !== texto(antes[k]))
      .map((k) => ({ campo: etiquetas[k] as string, antes: antes[k] ?? null, despues: despues[k] ?? null }));
  }
}

const texto = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Los valores se guardan como texto legible (los objetos, en JSON). */
function normalizar(c: CambioBitacora): CambioBitacora {
  const f = (v: unknown) => (v == null || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : v);
  return { campo: c.campo, antes: f(c.antes), despues: f(c.despues) };
}

@Global()
@Module({ providers: [BitacoraService], exports: [BitacoraService] })
export class BitacoraModule {}

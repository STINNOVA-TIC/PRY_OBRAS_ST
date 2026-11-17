import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Migraciones idempotentes que la API aplica sola al arrancar, para que una base creada
 * con una fase anterior se ponga al día sin perder datos (db/init solo corre con la base vacía).
 * Cada paso debe poder ejecutarse varias veces sin efecto (IF NOT EXISTS / ON CONFLICT).
 * Se registran en la tabla migraciones_aplicadas.
 */
export const MIGRACIONES: { id: string; sql: string }[] = [
  {
    id: '003_fase3_programa',
    sql: `
      ALTER TABLE obras ADD COLUMN IF NOT EXISTS dias_cobertura SMALLINT NOT NULL DEFAULT 7 CHECK (dias_cobertura > 0);
      ALTER TABLE obras ADD COLUMN IF NOT EXISTS dias_entrega   SMALLINT NOT NULL DEFAULT 7 CHECK (dias_entrega >= 0);
      CREATE TABLE IF NOT EXISTS obra_stock_minimo (
        obra_id     UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
        material_id INT           NOT NULL REFERENCES materiales(id),
        cantidad    NUMERIC(16,4) NOT NULL CHECK (cantidad >= 0),
        PRIMARY KEY (obra_id, material_id)
      );`,
  },
  {
    id: '004_fase4_transferencias',
    sql: `
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS documento_ref VARCHAR(60);
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS nota_recepcion TEXT;
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS anulado_por UUID REFERENCES usuarios(id);
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ;
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transferencias_anulada_chk') THEN
          ALTER TABLE transferencias ADD CONSTRAINT transferencias_anulada_chk CHECK ((estado = 'ANULADA') = (anulado_en IS NOT NULL));
        END IF;
      END $$;`,
  },
  {
    id: '005_fase4_permiso_bodega_central',
    sql: `
      INSERT INTO permisos (modulo_id, codigo, accion, descripcion)
      SELECT m.id, 'bodega.central', 'GESTIONAR', 'Operar la bodega central: ver su stock y kardex, ingresos y despachos'
        FROM modulos m WHERE m.codigo = 'BODEGA'
      ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo = 'bodega.central'
       WHERE r.codigo IN ('SUPERADMIN', 'ADMINISTRADOR', 'BODEGUERO')
      ON CONFLICT DO NOTHING;`,
  },
  {
    id: '006_residente_recibe_transferencias',
    sql: `
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo = 'bodega.firmar_transferencia'
       WHERE r.codigo = 'RESIDENTE'
      ON CONFLICT DO NOTHING;`,
  },
  {
    id: '007_fase5_planillas',
    sql: `
      ALTER TABLE planillas ADD COLUMN IF NOT EXISTS pagada_fecha DATE;
      ALTER TABLE planillas ADD COLUMN IF NOT EXISTS pago_ref VARCHAR(100);
      ALTER TABLE planillas ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
      INSERT INTO parametros (clave, valor, descripcion)
      VALUES ('PLANILLA_APODERADO', 'ING. ALEJANDRO NAVARRETE', 'Apoderado especial que firma las planillas impresas')
      ON CONFLICT (clave) DO NOTHING;`,
  },
  {
    id: '008_fase6_bitacora',
    sql: `
      ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS modulo VARCHAR(20);
      ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS entidad VARCHAR(30);
      ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS entidad_id VARCHAR(64);
      ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
      ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS agente VARCHAR(300);
      ALTER TABLE bitacora ALTER COLUMN usuario_id DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_bitacora_fecha ON bitacora (created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_bitacora_modulo ON bitacora (modulo, created_at DESC);
      UPDATE bitacora SET modulo = CASE
        WHEN accion ~* 'planilla' THEN 'PLANILLAS'
        WHEN accion ~* 'avance' THEN 'AVANCES'
        WHEN accion ~* 'transferencia|bodega|movimiento|ingreso|consumo|ajuste|devoluci|revirti' THEN 'BODEGA'
        WHEN accion ~* 'programa|cobertura' THEN 'PROGRAMA'
        WHEN accion ~* 'cat.logo|material|documento habilitante' THEN 'CONFIG'
        WHEN accion ~* 'rubro' THEN 'RUBROS'
        WHEN accion ~* 'habilitaci|requisito|documento|contratista|firm' THEN 'HABILITACION'
        ELSE 'OBRAS' END
      WHERE modulo IS NULL;`,
  },
  {
    id: '009_fase6_costeo',
    sql: `
      CREATE TABLE IF NOT EXISTS costeo_rubros (
        obra_rubro_id UUID PRIMARY KEY REFERENCES obra_rubros(id) ON DELETE CASCADE,
        obra_id       UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
        mat           NUMERIC(14,4) CHECK (mat IS NULL OR mat >= 0),
        mo            NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (mo >= 0),
        eq            NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (eq >= 0),
        sub           NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (sub >= 0),
        otr           NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (otr >= 0),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS costeo_materiales (
        obra_id     UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
        material_id INT           NOT NULL REFERENCES materiales(id),
        costo       NUMERIC(14,4) NOT NULL CHECK (costo >= 0),
        PRIMARY KEY (obra_id, material_id)
      );
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS costeo_pin_hash VARCHAR(200);`,
  },
  {
    id: '010_fase6_accesos',
    sql: `
      ALTER TABLE accesos_externos ADD COLUMN IF NOT EXISTS token VARCHAR(64);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_accesos_token ON accesos_externos (token);
      ALTER TABLE accesos_externos ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES usuarios(id);`,
  },
  {
    id: '011_transferencias_rechazo_notas',
    sql: `
      ALTER TABLE transferencias DROP CONSTRAINT IF EXISTS transferencias_estado_check;
      ALTER TABLE transferencias ADD CONSTRAINT transferencias_estado_check
        CHECK (estado IN ('SOLICITADA','APROBADA','DESPACHADA','RECIBIDA','ANULADA','RECHAZADA'));
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS rechazado_por UUID REFERENCES usuarios(id);
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS rechazado_en TIMESTAMPTZ;
      ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
      ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS nota_despacho TEXT;
      ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS archivo_despacho_id UUID REFERENCES archivos(id);
      ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS nota_recepcion TEXT;
      ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS archivo_recepcion_id UUID REFERENCES archivos(id);`,
  },
  {
    id: '012_permiso_respaldos',
    sql: `
      INSERT INTO permisos (modulo_id, codigo, accion, descripcion)
      SELECT m.id, 'respaldos.gestionar', 'GESTIONAR', 'Respaldos: ver el horario, sacar un respaldo manual y descargarlo'
      FROM modulos m WHERE m.codigo = 'CONFIG'
      ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p
      WHERE r.codigo IN ('SUPERADMIN', 'ADMINISTRADOR') AND p.codigo = 'respaldos.gestionar'
      ON CONFLICT DO NOTHING;`,
  },
];

@Injectable()
export class MigracionesService implements OnModuleInit {
  private readonly log = new Logger('Migraciones');
  constructor(private readonly db: DataSource) {}

  async onModuleInit() {
    await this.db.transaction(async (m) => {
      // Evita que dos instancias de la API migren a la vez
      await m.query(`SELECT pg_advisory_xact_lock(724001)`);
      await m.query(
        `CREATE TABLE IF NOT EXISTS migraciones_aplicadas (id VARCHAR(80) PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
      );
      const hechas: { id: string }[] = await m.query(`SELECT id FROM migraciones_aplicadas`);
      for (const mig of MIGRACIONES) {
        if (hechas.some((h) => h.id === mig.id)) continue;
        await m.query(mig.sql);
        await m.query(`INSERT INTO migraciones_aplicadas (id) VALUES ($1)`, [mig.id]);
        this.log.log(`Aplicada ${mig.id}`);
      }
    });
  }
}

@Global()
@Module({ providers: [MigracionesService] })
export class MigracionesModule {}

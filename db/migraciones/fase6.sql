-- Fase 6 (bitácora detallada, costeo, enlaces externos). La API las aplica sola al arrancar
-- (migraciones 008, 009 y 010); este archivo es solo de referencia.
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS modulo VARCHAR(20);
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS entidad VARCHAR(30);
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS entidad_id VARCHAR(64);
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS agente VARCHAR(300);
ALTER TABLE bitacora ALTER COLUMN usuario_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_bitacora_fecha ON bitacora (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_bitacora_modulo ON bitacora (modulo, created_at DESC);
CREATE TABLE IF NOT EXISTS costeo_rubros (
  obra_rubro_id UUID PRIMARY KEY REFERENCES obra_rubros(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  mat NUMERIC(14,4) CHECK (mat IS NULL OR mat >= 0),
  mo NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (mo >= 0),
  eq NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (eq >= 0),
  sub NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (sub >= 0),
  otr NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (otr >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS costeo_materiales (
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  material_id INT NOT NULL REFERENCES materiales(id),
  costo NUMERIC(14,4) NOT NULL CHECK (costo >= 0),
  PRIMARY KEY (obra_id, material_id)
);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS costeo_pin_hash VARCHAR(200);
ALTER TABLE accesos_externos ADD COLUMN IF NOT EXISTS token VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS ux_accesos_token ON accesos_externos (token);
ALTER TABLE accesos_externos ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES usuarios(id);

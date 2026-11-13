-- Migración fase 3 (rubros, programa y avances) para una base creada con la fase 2.
-- No borra datos. Ejecutar una vez:
--   docker compose exec -T db psql -U obras -d obras_v2 < db/migraciones/fase3.sql
ALTER TABLE obras ADD COLUMN IF NOT EXISTS dias_cobertura SMALLINT NOT NULL DEFAULT 7 CHECK (dias_cobertura > 0);
ALTER TABLE obras ADD COLUMN IF NOT EXISTS dias_entrega   SMALLINT NOT NULL DEFAULT 7 CHECK (dias_entrega >= 0);
CREATE TABLE IF NOT EXISTS obra_stock_minimo (
  obra_id     UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  material_id INT           NOT NULL REFERENCES materiales(id),
  cantidad    NUMERIC(16,4) NOT NULL CHECK (cantidad >= 0),
  PRIMARY KEY (obra_id, material_id)
);

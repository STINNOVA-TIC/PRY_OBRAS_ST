-- Rechazo de transferencias por falta de stock y observaciones/adjuntos por material.
-- La API lo aplica sola al arrancar (migración 011_transferencias_rechazo_notas); este archivo es solo de referencia.
ALTER TABLE transferencias DROP CONSTRAINT IF EXISTS transferencias_estado_check;
ALTER TABLE transferencias ADD CONSTRAINT transferencias_estado_check
  CHECK (estado IN ('SOLICITADA','APROBADA','DESPACHADA','RECIBIDA','ANULADA','RECHAZADA'));
ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS rechazado_por UUID REFERENCES usuarios(id);
ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS rechazado_en TIMESTAMPTZ;
ALTER TABLE transferencias ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS nota_despacho TEXT;
ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS archivo_despacho_id UUID REFERENCES archivos(id);
ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS nota_recepcion TEXT;
ALTER TABLE transferencia_items ADD COLUMN IF NOT EXISTS archivo_recepcion_id UUID REFERENCES archivos(id);

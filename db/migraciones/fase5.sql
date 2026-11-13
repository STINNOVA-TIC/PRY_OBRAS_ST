-- Fase 5 (planillas). La API la aplica sola al arrancar (migración 007_fase5_planillas);
-- este archivo es solo de referencia o para aplicarla a mano.
ALTER TABLE planillas ADD COLUMN IF NOT EXISTS pagada_fecha DATE;
ALTER TABLE planillas ADD COLUMN IF NOT EXISTS pago_ref VARCHAR(100);
ALTER TABLE planillas ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
INSERT INTO parametros (clave, valor, descripcion)
VALUES ('PLANILLA_APODERADO', 'ING. ALEJANDRO NAVARRETE', 'Apoderado especial que firma las planillas impresas')
ON CONFLICT (clave) DO NOTHING;

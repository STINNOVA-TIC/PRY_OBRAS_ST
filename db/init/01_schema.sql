-- =====================================================================
-- ST-OBRAS V2 · ESQUEMA
-- Seguimiento de obras de señalización vial (Industria ST-INNOVA S.A.)
-- Basado en la app real (obras-st) + firmas/aprobaciones estilo Punto de Venta
-- PostgreSQL 16
--
-- Convenciones
--   * Tablas en plural, columnas snake_case, estados/códigos en MAYÚSCULAS
--   * Entidades de negocio: UUID · catálogos: SERIAL
--   * Cantidades NUMERIC (hay kg, litros y metros con decimales)
--   * El stock solo cambia insertando en movimientos_inventario (kardex inmutable)
--   * Firmas: tabla única `firmas`, una fila por paso firmable de cada documento
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 1. SEGURIDAD (igual al modelo del POS: roles + permisos + excepciones)
-- =====================================================================
CREATE TABLE modulos (
  id     SERIAL PRIMARY KEY,
  codigo VARCHAR(40)  NOT NULL UNIQUE,
  nombre VARCHAR(80)  NOT NULL,
  icono  VARCHAR(50),
  orden  SMALLINT     NOT NULL DEFAULT 0,
  activo BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE permisos (
  id          SERIAL PRIMARY KEY,
  modulo_id   INT         NOT NULL REFERENCES modulos(id),
  codigo      VARCHAR(80) NOT NULL UNIQUE,        -- ej: obras.crear
  accion      VARCHAR(20) NOT NULL
              CHECK (accion IN ('VER','CREAR','EDITAR','ELIMINAR','APROBAR','FIRMAR','EXPORTAR','GESTIONAR')),
  descripcion TEXT,
  activo      BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(40) NOT NULL UNIQUE,
  nombre      VARCHAR(80) NOT NULL,
  descripcion TEXT,
  es_externo  BOOLEAN     NOT NULL DEFAULT FALSE,  -- usuarios de contratistas
  activo      BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE rol_permisos (
  rol_id     INT NOT NULL REFERENCES roles(id)    ON DELETE CASCADE,
  permiso_id INT NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

-- Archivos subidos (PDF e imágenes). Se crea antes de usuarios por la firma.
CREATE TABLE archivos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_original VARCHAR(255) NOT NULL,
  mime            VARCHAR(100) NOT NULL,
  tamano          INT          NOT NULL CHECK (tamano > 0),
  ruta            VARCHAR(300) NOT NULL UNIQUE,     -- relativa a la carpeta de uploads
  sha256          CHAR(64)     NOT NULL,
  categoria       VARCHAR(20)  NOT NULL DEFAULT 'DOCUMENTO'
                  CHECK (categoria IN ('DOCUMENTO','FIRMA','EVIDENCIA')),
  subido_por      UUID,                              -- FK se agrega tras crear usuarios
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE contratistas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc                 CHAR(13)     NOT NULL UNIQUE CHECK (ruc ~ '^[0-9]{13}$'),
  razon_social        VARCHAR(200) NOT NULL,
  nombre_comercial    VARCHAR(200),
  representante_legal VARCHAR(150),
  email               VARCHAR(150),
  telefono            VARCHAR(30),
  activo              BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                   VARCHAR(120) NOT NULL,
  email                    VARCHAR(150) NOT NULL,
  password_hash            VARCHAR(100) NOT NULL,
  cedula                   VARCHAR(13),
  cargo                    VARCHAR(120),          -- se imprime bajo la firma
  telefono                 VARCHAR(30),
  firma_archivo_id         UUID REFERENCES archivos(id) ON DELETE SET NULL,
  contratista_id           UUID REFERENCES contratistas(id) ON DELETE SET NULL,
  requiere_cambio_password BOOLEAN      NOT NULL DEFAULT TRUE,
  activo                   BOOLEAN      NOT NULL DEFAULT TRUE,
  ultimo_login             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  desactivado_en           TIMESTAMPTZ,
  costeo_pin_hash          VARCHAR(200)                -- código del costeo privado
);
CREATE UNIQUE INDEX ux_usuarios_email  ON usuarios (LOWER(email));
CREATE UNIQUE INDEX ux_usuarios_cedula ON usuarios (cedula) WHERE cedula IS NOT NULL;

ALTER TABLE archivos
  ADD CONSTRAINT fk_archivos_subido_por FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE TABLE usuario_roles (
  usuario_id   UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id       INT         NOT NULL REFERENCES roles(id)    ON DELETE CASCADE,
  asignado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  asignado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rol_id)
);

CREATE TABLE usuario_permisos (
  usuario_id  UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permiso_id  INT         NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  tipo        VARCHAR(10) NOT NULL DEFAULT 'CONCEDER' CHECK (tipo IN ('CONCEDER','DENEGAR')),
  asignado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, permiso_id)
);

CREATE OR REPLACE FUNCTION fn_chk_rol_externo() RETURNS trigger AS $$
BEGIN
  IF (SELECT es_externo FROM roles WHERE id = NEW.rol_id)
     AND (SELECT contratista_id FROM usuarios WHERE id = NEW.usuario_id) IS NULL THEN
    RAISE EXCEPTION 'Un rol externo requiere que el usuario esté vinculado a un contratista';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chk_rol_externo
  BEFORE INSERT OR UPDATE ON usuario_roles
  FOR EACH ROW EXECUTE FUNCTION fn_chk_rol_externo();

-- Permisos efectivos = roles activos + CONCEDER − DENEGAR
CREATE VIEW vw_permisos_efectivos AS
SELECT u.id AS usuario_id, p.id AS permiso_id, p.codigo
FROM usuarios u
JOIN usuario_roles ur ON ur.usuario_id = u.id
JOIN roles r          ON r.id = ur.rol_id AND r.activo
JOIN rol_permisos rp  ON rp.rol_id = r.id
JOIN permisos p       ON p.id = rp.permiso_id AND p.activo
WHERE u.activo
UNION
SELECT u.id, p.id, p.codigo
FROM usuarios u
JOIN usuario_permisos up ON up.usuario_id = u.id AND up.tipo = 'CONCEDER'
JOIN permisos p          ON p.id = up.permiso_id AND p.activo
WHERE u.activo
EXCEPT
SELECT up.usuario_id, p.id, p.codigo
FROM usuario_permisos up
JOIN permisos p ON p.id = up.permiso_id
WHERE up.tipo = 'DENEGAR';


-- =====================================================================
-- 2. CONFIGURACIÓN Y CATÁLOGOS (config/* de la app real)
-- =====================================================================
CREATE TABLE parametros (
  clave       VARCHAR(40) PRIMARY KEY,           -- UMBRAL_ALERTA_PCT, UMBRAL_CRITICO_PCT, IVA_PCT...
  valor       VARCHAR(200) NOT NULL,
  descripcion TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE materiales (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(20)   NOT NULL UNIQUE,   -- m01, m02...
  nombre         VARCHAR(150)  NOT NULL,
  unidad         VARCHAR(20)   NOT NULL,
  costo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  stock_minimo   NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  activo         BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE catalogo_rubros (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(30),
  descripcion VARCHAR(300)  NOT NULL,
  unidad      VARCHAR(20)   NOT NULL,
  pu_ref      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (pu_ref >= 0),
  clase       VARCHAR(10) CHECK (clase IN ('TERMO','TACHAS')),
  activo      BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Insumos sugeridos por unidad de rubro (se copian a la obra al agregar el rubro)
CREATE TABLE catalogo_rubro_insumos (
  catalogo_rubro_id   INT           NOT NULL REFERENCES catalogo_rubros(id) ON DELETE CASCADE,
  material_id         INT           NOT NULL REFERENCES materiales(id),
  cantidad_por_unidad NUMERIC(14,6) NOT NULL CHECK (cantidad_por_unidad > 0),
  PRIMARY KEY (catalogo_rubro_id, material_id)
);

-- Rendimientos de materiales (valor = N / D)
--  REND : N = producción de la clase (avances) · D = consumo de materiales / factor
--  DOSIS: N = consumo de materiales / factor   · D = consumo de base / factor_base
CREATE TABLE rendimientos (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(20)   NOT NULL UNIQUE,
  nombre      VARCHAR(150)  NOT NULL,
  tipo        VARCHAR(5)    NOT NULL CHECK (tipo IN ('REND','DOSIS')),
  clase       VARCHAR(10)   CHECK (clase IN ('TERMO','TACHAS')),
  unidad      VARCHAR(40)   NOT NULL,             -- en qué se expresa el consumo (t, caneca de 5 gal...)
  factor      NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (factor > 0),
  unidad_base VARCHAR(40),
  factor_base NUMERIC(14,4) CHECK (factor_base IS NULL OR factor_base > 0),
  minimo      NUMERIC(14,4),
  bueno       NUMERIC(14,4),
  ideal       NUMERIC(14,4),
  maximo      NUMERIC(14,4),
  activo      BOOLEAN       NOT NULL DEFAULT TRUE,
  CHECK (tipo = 'REND' AND clase IS NOT NULL OR tipo = 'DOSIS' AND factor_base IS NOT NULL)
);

CREATE TABLE rendimiento_materiales (
  rendimiento_id INT         NOT NULL REFERENCES rendimientos(id) ON DELETE CASCADE,
  material_id    INT         NOT NULL REFERENCES materiales(id),
  rol            VARCHAR(5)  NOT NULL DEFAULT 'MAT' CHECK (rol IN ('MAT','BASE')),
  PRIMARY KEY (rendimiento_id, material_id, rol)
);

-- Requisitos administrativos de habilitación (preciosMtk, cotizacion, contrato, anticipo)
CREATE TABLE tipos_requisito (
  id                 SERIAL PRIMARY KEY,
  codigo             VARCHAR(30)  NOT NULL UNIQUE,
  nombre             VARCHAR(120) NOT NULL,
  texto_confirmacion VARCHAR(250) NOT NULL,
  etiqueta_ref       VARCHAR(80)  NOT NULL,
  etiqueta_fecha     VARCHAR(80)  NOT NULL,
  etiqueta_adjunto   VARCHAR(80)  NOT NULL,
  es_monto           BOOLEAN      NOT NULL DEFAULT FALSE,
  orden              SMALLINT     NOT NULL DEFAULT 0,
  activo             BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Documentos habilitantes de contratistas (ruc, rl, iess, sri, fiel, antic, sub)
CREATE TABLE tipos_documento_contratista (
  id      SERIAL PRIMARY KEY,
  codigo  VARCHAR(20)  NOT NULL UNIQUE,
  nombre  VARCHAR(150) NOT NULL,
  vence   BOOLEAN      NOT NULL DEFAULT FALSE,
  orden   SMALLINT     NOT NULL DEFAULT 0,
  activo  BOOLEAN      NOT NULL DEFAULT TRUE
);


-- =====================================================================
-- 3. OBRAS Y EQUIPO
-- =====================================================================
CREATE TABLE obras (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             VARCHAR(30)  UNIQUE,
  nombre             VARCHAR(200) NOT NULL,
  cliente            VARCHAR(200),
  ubicacion          VARCHAR(200),
  provincia          VARCHAR(100),
  descripcion        TEXT,
  plazo_texto        VARCHAR(60),                  -- "1 mes", se imprime en planillas
  fecha_inicio       DATE,
  fecha_fin          DATE,
  estado             VARCHAR(15)  NOT NULL DEFAULT 'HABILITACION'
                     CHECK (estado IN ('HABILITACION','ACTIVA','PAUSADA','CERRADA')),
  -- Firmantes designados de la habilitación (como empleado_aprobador_id del POS)
  administrador_id   UUID REFERENCES usuarios(id),
  superintendente_id UUID REFERENCES usuarios(id),
  habilitada_en      TIMESTAMPTZ,
  -- Programa
  dias_laborables_semana SMALLINT NOT NULL DEFAULT 6 CHECK (dias_laborables_semana BETWEEN 1 AND 7),
  ventana_ritmo_dias     SMALLINT NOT NULL DEFAULT 14 CHECK (ventana_ritmo_dias > 0),
  dias_cobertura         SMALLINT NOT NULL DEFAULT 7 CHECK (dias_cobertura > 0),   -- stock mínimo = consumo diario × días
  dias_entrega           SMALLINT NOT NULL DEFAULT 7 CHECK (dias_entrega >= 0),    -- producción y entrega de material
  creado_por         UUID         NOT NULL REFERENCES usuarios(id),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  eliminado_en       TIMESTAMPTZ,
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
  CHECK (administrador_id IS NULL OR superintendente_id IS NULL OR administrador_id <> superintendente_id)
);
CREATE INDEX ix_obras_estado ON obras (estado) WHERE eliminado_en IS NULL;

-- Equipo de la obra: quién la ve y con qué función
CREATE TABLE obra_miembros (
  obra_id      UUID        NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  usuario_id   UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  funcion      VARCHAR(20) NOT NULL
               CHECK (funcion IN ('ADMINISTRADOR','SUPERINTENDENTE','RESIDENTE','BODEGUERO','VISUALIZADOR')),
  asignado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  asignado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (obra_id, usuario_id)
);
CREATE INDEX ix_obra_miembros_usuario ON obra_miembros (usuario_id);


-- =====================================================================
-- 4. HABILITACIÓN
-- =====================================================================
CREATE TABLE obra_requisitos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo_id          INT           NOT NULL REFERENCES tipos_requisito(id),
  referencia       VARCHAR(150),
  fecha            DATE,
  monto            NUMERIC(16,2) CHECK (monto IS NULL OR monto >= 0),
  archivo_id       UUID REFERENCES archivos(id),
  confirmado       BOOLEAN       NOT NULL DEFAULT FALSE,   -- "Confirmo que..."
  cargado_por      UUID REFERENCES usuarios(id),
  cargado_en       TIMESTAMPTZ,
  revisado_por     UUID REFERENCES usuarios(id),           -- el "OK" de revisión
  revisado_en      TIMESTAMPTZ,
  UNIQUE (obra_id, tipo_id)
);

CREATE TABLE obra_contratistas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id        UUID        NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  contratista_id UUID        NOT NULL REFERENCES contratistas(id),
  objeto         VARCHAR(300),                            -- alcance del subcontrato
  activo         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, contratista_id)
);

CREATE TABLE contratista_documentos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_contratista_id UUID        NOT NULL REFERENCES obra_contratistas(id) ON DELETE CASCADE,
  tipo_id             INT         NOT NULL REFERENCES tipos_documento_contratista(id),
  version             SMALLINT    NOT NULL DEFAULT 1,
  archivo_id          UUID        NOT NULL REFERENCES archivos(id),
  vence               DATE,
  estado              VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO')),
  observacion         TEXT,
  vigente             BOOLEAN     NOT NULL DEFAULT TRUE,
  cargado_por         UUID REFERENCES usuarios(id),
  cargado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_por        UUID REFERENCES usuarios(id),
  revisado_en         TIMESTAMPTZ,
  UNIQUE (obra_contratista_id, tipo_id, version),
  CHECK (estado <> 'RECHAZADO' OR observacion IS NOT NULL)
);
CREATE UNIQUE INDEX ux_ctr_doc_vigente ON contratista_documentos (obra_contratista_id, tipo_id) WHERE vigente;

CREATE OR REPLACE FUNCTION fn_ctr_doc_nueva_version() RETURNS trigger AS $$
BEGIN
  IF NEW.vigente THEN
    UPDATE contratista_documentos SET vigente = FALSE
     WHERE obra_contratista_id = NEW.obra_contratista_id AND tipo_id = NEW.tipo_id
       AND vigente AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ctr_doc_nueva_version
  BEFORE INSERT ON contratista_documentos
  FOR EACH ROW EXECUTE FUNCTION fn_ctr_doc_nueva_version();

-- Accesos externos por código ("cargas" de la app real):
--  DOCUMENTO     → una persona sube un requisito puntual (con intentos limitados)
--  ADMINISTRATIVO→ carga y da OK de los 4 requisitos
--  SIG           → carga y da OK de documentos de contratistas
--  CONTRATISTA   → sube los documentos de su empresa (el OK lo da SIG)
CREATE TABLE accesos_externos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             UUID         NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo                VARCHAR(15)  NOT NULL CHECK (tipo IN ('DOCUMENTO','ADMINISTRATIVO','SIG','CONTRATISTA')),
  tipo_requisito_id   INT REFERENCES tipos_requisito(id),
  obra_contratista_id UUID REFERENCES obra_contratistas(id) ON DELETE CASCADE,
  nombre              VARCHAR(150) NOT NULL,
  email               VARCHAR(150) NOT NULL,
  codigo              CHAR(6)      NOT NULL UNIQUE,
  token               VARCHAR(64)  UNIQUE,                    -- enlace de carga sin cuenta
  max_intentos        SMALLINT     NOT NULL DEFAULT 5 CHECK (max_intentos > 0),
  estado              VARCHAR(10)  NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO','CERRADO','CANCELADO')),
  usuario_id          UUID REFERENCES usuarios(id),          -- quien canjeó el código
  creado_por          UUID         NOT NULL REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  canjeado_en         TIMESTAMPTZ,
  cerrado_en          TIMESTAMPTZ,
  cancelado_por       UUID REFERENCES usuarios(id),
  CHECK (tipo <> 'DOCUMENTO'   OR tipo_requisito_id IS NOT NULL),
  CHECK (tipo <> 'CONTRATISTA' OR obra_contratista_id IS NOT NULL)
);

CREATE TABLE acceso_externo_usos (
  acceso_id UUID        NOT NULL REFERENCES accesos_externos(id) ON DELETE CASCADE,
  clave     VARCHAR(80) NOT NULL,            -- requisito o "<obra_contratista>|<tipo_doc>"
  usos      SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (acceso_id, clave)
);


-- =====================================================================
-- 5. FIRMAS (patrón del POS generalizado)
--   Cada documento firmable tiene sus pasos (rol_firma) con un firmante designado.
--   Al firmar se estampa: imagen de la firma, nombre y cargo del momento, y fecha.
-- =====================================================================
CREATE TABLE firmas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_tipo  VARCHAR(20)  NOT NULL
                CHECK (entidad_tipo IN ('HABILITACION','PLANILLA','TRANSFERENCIA')),
  entidad_id    UUID         NOT NULL,
  rol_firma     VARCHAR(30)  NOT NULL,          -- ADMINISTRADOR, SUPERINTENDENTE, ELABORADO, REVISADO, APROBADO, DESPACHADO, RECIBIDO...
  etiqueta      VARCHAR(80)  NOT NULL,          -- texto que se imprime: "Superintendente de obra"
  orden         SMALLINT     NOT NULL,
  designado_id  UUID REFERENCES usuarios(id),
  -- Estampado al firmar
  firmado_por   UUID REFERENCES usuarios(id),
  firma_archivo_id UUID REFERENCES archivos(id),
  nombre_firmante VARCHAR(120),
  cargo_firmante  VARCHAR(120),
  firmado_en    TIMESTAMPTZ,
  es_reemplazo  BOOLEAN      NOT NULL DEFAULT FALSE,
  motivo        TEXT,
  UNIQUE (entidad_tipo, entidad_id, rol_firma),
  UNIQUE (entidad_tipo, entidad_id, orden),
  CHECK ((firmado_en IS NULL) = (firmado_por IS NULL)),
  CHECK (NOT es_reemplazo OR motivo IS NOT NULL)
);
CREATE INDEX ix_firmas_designado_pend ON firmas (designado_id) WHERE firmado_en IS NULL;


-- =====================================================================
-- 6. RUBROS, PROGRAMA Y AVANCES
-- =====================================================================
CREATE TABLE obra_rubros (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  catalogo_rubro_id INT REFERENCES catalogo_rubros(id),
  codigo            VARCHAR(30),
  descripcion       VARCHAR(300)  NOT NULL,
  unidad            VARCHAR(20)   NOT NULL,
  cantidad          NUMERIC(16,4) NOT NULL CHECK (cantidad >= 0),
  precio_unitario   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  clase             VARCHAR(10)   CHECK (clase IN ('TERMO','TACHAS','NINGUNA')),  -- NULL = automática
  ancho_cm          NUMERIC(6,2)  CHECK (ancho_cm IS NULL OR ancho_cm > 0),
  orden             SMALLINT      NOT NULL DEFAULT 0,
  -- Programa del rubro
  prog_inicio       DATE,
  prog_fin          DATE,
  prog_rend_dia     NUMERIC(14,4) CHECK (prog_rend_dia IS NULL OR prog_rend_dia >= 0),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (prog_fin IS NULL OR prog_inicio IS NULL OR prog_fin >= prog_inicio)
);
CREATE INDEX ix_obra_rubros_obra ON obra_rubros (obra_id, orden);

-- Insumos por unidad de rubro (APU)
CREATE TABLE obra_rubro_insumos (
  obra_rubro_id       UUID          NOT NULL REFERENCES obra_rubros(id) ON DELETE CASCADE,
  material_id         INT           NOT NULL REFERENCES materiales(id),
  cantidad_por_unidad NUMERIC(14,6) NOT NULL CHECK (cantidad_por_unidad > 0),
  PRIMARY KEY (obra_rubro_id, material_id)
);

-- Precio unitario de subcontrato por contratista y rubro (para sus planillas)
-- Stock mínimo fijo por material en la obra (reemplaza el cálculo por días de cobertura)
CREATE TABLE obra_stock_minimo (
  obra_id     UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  material_id INT           NOT NULL REFERENCES materiales(id),
  cantidad    NUMERIC(16,4) NOT NULL CHECK (cantidad >= 0),
  PRIMARY KEY (obra_id, material_id)
);
CREATE TABLE obra_contratista_precios (
  obra_contratista_id UUID          NOT NULL REFERENCES obra_contratistas(id) ON DELETE CASCADE,
  obra_rubro_id       UUID          NOT NULL REFERENCES obra_rubros(id) ON DELETE CASCADE,
  precio_unitario     NUMERIC(14,4) NOT NULL CHECK (precio_unitario >= 0),
  PRIMARY KEY (obra_contratista_id, obra_rubro_id)
);

CREATE TABLE avances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  obra_rubro_id       UUID          NOT NULL REFERENCES obra_rubros(id),
  obra_contratista_id UUID REFERENCES obra_contratistas(id),  -- NULL = ejecutado por ST
  fecha               DATE          NOT NULL,
  cantidad            NUMERIC(16,4) NOT NULL CHECK (cantidad > 0),
  frente              VARCHAR(100),
  tramo               VARCHAR(100),
  abscisa_desde       VARCHAR(30),
  abscisa_hasta       VARCHAR(30),
  color               VARCHAR(20),
  tipo_linea          VARCHAR(20),
  num_lineas          SMALLINT      CHECK (num_lineas IS NULL OR num_lineas > 0),
  nota                TEXT,
  registrado_por      UUID          NOT NULL REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  anulado_por         UUID REFERENCES usuarios(id),
  anulado_en          TIMESTAMPTZ,
  motivo_anulacion    TEXT,
  CHECK ((anulado_en IS NULL) OR (motivo_anulacion IS NOT NULL))
);
CREATE INDEX ix_avances_obra_fecha ON avances (obra_id, fecha) WHERE anulado_en IS NULL;
CREATE INDEX ix_avances_rubro      ON avances (obra_rubro_id)  WHERE anulado_en IS NULL;

CREATE TABLE avance_evidencias (
  avance_id  UUID NOT NULL REFERENCES avances(id) ON DELETE CASCADE,
  archivo_id UUID NOT NULL REFERENCES archivos(id),
  PRIMARY KEY (avance_id, archivo_id)
);


-- =====================================================================
-- 7. BODEGA: inventario global segmentado por bodega (central + una por obra)
-- =====================================================================
CREATE TABLE bodegas (
  id      SERIAL PRIMARY KEY,
  codigo  VARCHAR(30)  NOT NULL UNIQUE,
  nombre  VARCHAR(150) NOT NULL,
  tipo    VARCHAR(8)   NOT NULL CHECK (tipo IN ('CENTRAL','OBRA')),
  obra_id UUID UNIQUE REFERENCES obras(id) ON DELETE RESTRICT,
  activo  BOOLEAN      NOT NULL DEFAULT TRUE,
  CHECK ((tipo = 'OBRA') = (obra_id IS NOT NULL))
);

-- Cada obra nueva tiene su bodega
CREATE OR REPLACE FUNCTION fn_crear_bodega_obra() RETURNS trigger AS $$
BEGIN
  INSERT INTO bodegas (codigo, nombre, tipo, obra_id)
  VALUES ('OBRA-' || substr(NEW.id::text, 1, 8), 'Bodega ' || NEW.nombre, 'OBRA', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crear_bodega_obra
  AFTER INSERT ON obras
  FOR EACH ROW EXECUTE FUNCTION fn_crear_bodega_obra();

CREATE TABLE stock (
  bodega_id   INT           NOT NULL REFERENCES bodegas(id),
  material_id INT           NOT NULL REFERENCES materiales(id),
  cantidad    NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  PRIMARY KEY (bodega_id, material_id)
);

-- Transferencias entre bodegas (central → obra, obra → central). Firmables.
CREATE TABLE transferencias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  bodega_origen_id  INT         NOT NULL REFERENCES bodegas(id),
  bodega_destino_id INT         NOT NULL REFERENCES bodegas(id),
  estado            VARCHAR(12) NOT NULL DEFAULT 'SOLICITADA'
                    CONSTRAINT transferencias_estado_check
                    CHECK (estado IN ('SOLICITADA','APROBADA','DESPACHADA','RECIBIDA','ANULADA','RECHAZADA')),
  motivo            TEXT,
  documento_ref     VARCHAR(60),                    -- N.º de guía de despacho
  nota_recepcion    TEXT,                           -- novedades al recibir (faltantes, daños)
  anulado_por       UUID REFERENCES usuarios(id),
  anulado_en        TIMESTAMPTZ,
  motivo_anulacion  TEXT,
  rechazado_por     UUID REFERENCES usuarios(id),         -- bodega rechaza por falta de stock
  rechazado_en      TIMESTAMPTZ,
  motivo_rechazo    TEXT,
  creado_por        UUID        NOT NULL REFERENCES usuarios(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (bodega_origen_id <> bodega_destino_id),
  CONSTRAINT transferencias_anulada_chk CHECK ((estado = 'ANULADA') = (anulado_en IS NOT NULL))
);

CREATE TABLE transferencia_items (
  id                  BIGSERIAL PRIMARY KEY,
  transferencia_id    UUID          NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
  material_id         INT           NOT NULL REFERENCES materiales(id),
  cantidad_solicitada NUMERIC(16,4) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_despachada NUMERIC(16,4) CHECK (cantidad_despachada IS NULL OR cantidad_despachada >= 0),
  cantidad_recibida   NUMERIC(16,4) CHECK (cantidad_recibida IS NULL OR cantidad_recibida >= 0),
  nota_despacho        TEXT,                                 -- observación opcional por material
  archivo_despacho_id  UUID REFERENCES archivos(id),         -- foto o documento opcional
  nota_recepcion       TEXT,
  archivo_recepcion_id UUID REFERENCES archivos(id),
  UNIQUE (transferencia_id, material_id)
);

-- Kardex: única vía para modificar stock
CREATE TABLE movimientos_inventario (
  id               BIGSERIAL PRIMARY KEY,
  bodega_id        INT           NOT NULL REFERENCES bodegas(id),
  material_id      INT           NOT NULL REFERENCES materiales(id),
  tipo             VARCHAR(25)   NOT NULL CHECK (tipo IN (
                     'INGRESO',               -- compra o entrada a bodega
                     'TRANSFERENCIA_SALIDA',  -- sale hacia otra bodega
                     'TRANSFERENCIA_ENTRADA', -- llega desde otra bodega
                     'CONSUMO',               -- uso en obra (puede indicar rubro)
                     'DEVOLUCION',            -- salida/devolución al proveedor
                     'AJUSTE')),              -- corrección (+/-)
  cantidad         NUMERIC(16,4) NOT NULL CHECK (cantidad <> 0),  -- + entra / − sale
  stock_anterior   NUMERIC(16,4) NOT NULL DEFAULT 0,             -- lo llena el trigger
  stock_nuevo      NUMERIC(16,4) NOT NULL DEFAULT 0,             -- lo llena el trigger
  costo_unitario   NUMERIC(14,4) CHECK (costo_unitario IS NULL OR costo_unitario >= 0),
  fecha            DATE          NOT NULL DEFAULT CURRENT_DATE,
  documento_ref    VARCHAR(60),                                  -- N.º de guía/factura/ODD
  archivo_id       UUID REFERENCES archivos(id),
  obra_rubro_id    UUID REFERENCES obra_rubros(id),
  transferencia_id UUID REFERENCES transferencias(id),
  movimiento_revertido_id BIGINT REFERENCES movimientos_inventario(id),
  nota             TEXT,
  usuario_id       UUID          NOT NULL REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (tipo NOT IN ('INGRESO','TRANSFERENCIA_ENTRADA') OR cantidad > 0),
  CHECK (tipo NOT IN ('CONSUMO','DEVOLUCION','TRANSFERENCIA_SALIDA') OR cantidad < 0 OR movimiento_revertido_id IS NOT NULL),
  CHECK (tipo NOT LIKE 'TRANSFERENCIA%' OR transferencia_id IS NOT NULL)
);
CREATE INDEX ix_mov_bodega_mat ON movimientos_inventario (bodega_id, material_id, created_at);
CREATE INDEX ix_mov_rubro      ON movimientos_inventario (obra_rubro_id) WHERE obra_rubro_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_aplicar_movimiento() RETURNS trigger AS $$
DECLARE
  v_stock NUMERIC(16,4);
  v_tipo  VARCHAR(8);
BEGIN
  SELECT tipo INTO v_tipo FROM bodegas WHERE id = NEW.bodega_id;
  IF NEW.tipo = 'CONSUMO' AND v_tipo <> 'OBRA' THEN
    RAISE EXCEPTION 'Los consumos solo se registran en la bodega de una obra';
  END IF;

  INSERT INTO stock (bodega_id, material_id, cantidad)
  VALUES (NEW.bodega_id, NEW.material_id, 0)
  ON CONFLICT DO NOTHING;

  SELECT cantidad INTO v_stock FROM stock
   WHERE bodega_id = NEW.bodega_id AND material_id = NEW.material_id FOR UPDATE;

  IF v_stock + NEW.cantidad < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', v_stock, -NEW.cantidad;
  END IF;

  NEW.stock_anterior := v_stock;
  NEW.stock_nuevo    := v_stock + NEW.cantidad;

  UPDATE stock SET cantidad = NEW.stock_nuevo
   WHERE bodega_id = NEW.bodega_id AND material_id = NEW.material_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_aplicar_movimiento
  BEFORE INSERT ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_aplicar_movimiento();

CREATE OR REPLACE FUNCTION fn_bloquear_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es inmutable: registre un movimiento de reverso o ajuste', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mov_inmutable
  BEFORE UPDATE OR DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_cambios();

CREATE OR REPLACE FUNCTION fn_proteger_stock() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'El stock solo cambia mediante movimientos_inventario';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proteger_stock
  BEFORE UPDATE ON stock
  FOR EACH ROW EXECUTE FUNCTION fn_proteger_stock();


-- =====================================================================
-- 8. PLANILLAS (ST al cliente / contratistas). Firmables.
-- =====================================================================
CREATE TABLE planillas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo                VARCHAR(12)   NOT NULL CHECK (tipo IN ('CLIENTE','CONTRATISTA')),
  obra_contratista_id UUID REFERENCES obra_contratistas(id),
  numero              INT           NOT NULL CHECK (numero > 0),
  periodo_desde       DATE          NOT NULL,
  periodo_hasta       DATE          NOT NULL,
  estado              VARCHAR(12)   NOT NULL DEFAULT 'BORRADOR'
                      CHECK (estado IN ('BORRADOR','PRESENTADA','OBSERVADA','APROBADA','PAGADA','ANULADA')),
  multa               NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  multa_detalle       TEXT,
  iva_pct             NUMERIC(5,2)  NOT NULL DEFAULT 15 CHECK (iva_pct >= 0),
  observacion         TEXT,
  archivo_id          UUID REFERENCES archivos(id),        -- planilla firmada escaneada
  formato             JSONB         NOT NULL DEFAULT '{}'::jsonb, -- proyecto, provincia, plazo, fiscalización...
  creado_por          UUID          NOT NULL REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  estado_por          UUID REFERENCES usuarios(id),
  estado_en           TIMESTAMPTZ,
  pagada_fecha        DATE,
  pago_ref            VARCHAR(100),                       -- comprobante / transferencia del pago
  motivo_anulacion    TEXT,
  CHECK ((tipo = 'CONTRATISTA') = (obra_contratista_id IS NOT NULL)),
  CHECK (periodo_hasta >= periodo_desde)
);
CREATE UNIQUE INDEX ux_planilla_cli ON planillas (obra_id, numero) WHERE tipo = 'CLIENTE' AND estado <> 'ANULADA';
CREATE UNIQUE INDEX ux_planilla_ctr ON planillas (obra_contratista_id, numero) WHERE tipo = 'CONTRATISTA' AND estado <> 'ANULADA';

CREATE TABLE planilla_lineas (
  id                 BIGSERIAL PRIMARY KEY,
  planilla_id        UUID          NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
  obra_rubro_id      UUID          NOT NULL REFERENCES obra_rubros(id),
  codigo             VARCHAR(30),
  descripcion        VARCHAR(300)  NOT NULL,
  unidad             VARCHAR(20)   NOT NULL,
  cantidad_contrato  NUMERIC(16,4) NOT NULL DEFAULT 0,
  precio_unitario    NUMERIC(14,4) NOT NULL DEFAULT 0,
  cantidad_anterior  NUMERIC(16,4) NOT NULL DEFAULT 0,   -- planillado en planillas previas
  cantidad_periodo   NUMERIC(16,4) NOT NULL DEFAULT 0,   -- lo que se cobra ahora
  cantidad_app       NUMERIC(16,4) NOT NULL DEFAULT 0,   -- lo registrado en avances del período
  subtotal           NUMERIC(16,2) GENERATED ALWAYS AS (ROUND(cantidad_periodo * precio_unitario, 2)) STORED,
  UNIQUE (planilla_id, obra_rubro_id)
);

CREATE VIEW vw_planilla_totales AS
SELECT p.id AS planilla_id,
       COALESCE(SUM(l.subtotal), 0)                                   AS subtotal,
       p.multa,
       COALESCE(SUM(l.subtotal), 0) - p.multa                         AS base,
       ROUND((COALESCE(SUM(l.subtotal), 0) - p.multa) * p.iva_pct / 100, 2) AS iva,
       ROUND((COALESCE(SUM(l.subtotal), 0) - p.multa) * (1 + p.iva_pct / 100), 2) AS total,
       COALESCE(SUM(ROUND(l.cantidad_anterior * l.precio_unitario, 2)), 0) AS anterior,
       COUNT(*) FILTER (WHERE abs(l.cantidad_periodo - l.cantidad_app) > 0.0001) AS alertas
FROM planillas p
LEFT JOIN planilla_lineas l ON l.planilla_id = p.id
GROUP BY p.id;


-- =====================================================================
-- 9. COSTEO PRIVADO
-- =====================================================================
CREATE TABLE costeo_indirectos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  descripcion VARCHAR(200)  NOT NULL,
  tipo        VARCHAR(5)    NOT NULL CHECK (tipo IN ('PCT','MONTO')),
  valor       NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  orden       SMALLINT      NOT NULL DEFAULT 0
);

-- Costos unitarios internos por rubro (mat NULL = se calcula con insumos × costo del material)
CREATE TABLE costeo_rubros (
  obra_rubro_id UUID PRIMARY KEY REFERENCES obra_rubros(id) ON DELETE CASCADE,
  obra_id       UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  mat           NUMERIC(14,4) CHECK (mat IS NULL OR mat >= 0),
  mo            NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (mo >= 0),
  eq            NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (eq >= 0),
  sub           NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (sub >= 0),
  otr           NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (otr >= 0),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Costo interno de un material en una obra (si no hay, se usa materiales.costo_unitario)
CREATE TABLE costeo_materiales (
  obra_id     UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  material_id INT           NOT NULL REFERENCES materiales(id),
  costo       NUMERIC(14,4) NOT NULL CHECK (costo >= 0),
  PRIMARY KEY (obra_id, material_id)
);

CREATE TABLE costeo_costos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id       UUID          NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  obra_rubro_id UUID REFERENCES obra_rubros(id) ON DELETE CASCADE,
  categoria     VARCHAR(3)    NOT NULL CHECK (categoria IN ('MAT','MO','EQ','SUB','OTR')),
  descripcion   VARCHAR(200)  NOT NULL,
  monto         NUMERIC(16,2) NOT NULL CHECK (monto >= 0),
  fecha         DATE,
  usuario_id    UUID          NOT NULL REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- =====================================================================
-- 10. BITÁCORA (eventos legibles) Y AUDITORÍA (cambios técnicos)
-- =====================================================================
CREATE TABLE bitacora (
  id         BIGSERIAL PRIMARY KEY,
  obra_id    UUID REFERENCES obras(id) ON DELETE SET NULL,
  accion     VARCHAR(120) NOT NULL,           -- "Registró avance", "Firmó la habilitación"...
  detalle    TEXT,
  cambios    JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{campo, antes, despues}]
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,   -- NULL: evento sin sesión (ingreso fallido)
  modulo     VARCHAR(20),                     -- OBRAS, PLANILLAS, BODEGA, USUARIOS, ACCESO...
  entidad    VARCHAR(30),                     -- PLANILLA, TRANSFERENCIA... (para enlazar)
  entidad_id VARCHAR(64),
  ip         VARCHAR(64),
  agente     VARCHAR(300),                    -- navegador
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_bitacora_fecha  ON bitacora (created_at DESC);
CREATE INDEX ix_bitacora_modulo ON bitacora (modulo, created_at DESC);
CREATE INDEX ix_bitacora_obra    ON bitacora (obra_id, created_at DESC);
CREATE INDEX ix_bitacora_usuario ON bitacora (usuario_id, created_at DESC);

CREATE TABLE auditoria_log (
  id            BIGSERIAL PRIMARY KEY,
  tabla         VARCHAR(60) NOT NULL,
  registro_id   TEXT        NOT NULL,
  operacion     VARCHAR(10) NOT NULL CHECK (operacion IN ('INSERT','UPDATE','DELETE')),
  datos_antes   JSONB,
  datos_despues JSONB,
  usuario_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_registro ON auditoria_log (tabla, registro_id, created_at);

-- El backend hace en cada transacción: SET LOCAL obras.usuario_id = '<uuid>'
CREATE OR REPLACE FUNCTION fn_auditar() RETURNS trigger AS $$
DECLARE
  v_usuario UUID := NULLIF(current_setting('obras.usuario_id', TRUE), '')::uuid;
  v_fila    JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
  INSERT INTO auditoria_log (tabla, registro_id, operacion, datos_antes, datos_despues, usuario_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(v_fila->>'id', v_fila->>'obra_id', '?'),
    TG_OP,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'password_hash' END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'password_hash' END,
    v_usuario
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE notificaciones (
  id         BIGSERIAL PRIMARY KEY,
  usuario_id UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo     VARCHAR(200) NOT NULL,
  mensaje    TEXT,
  enlace     VARCHAR(300),
  leida_en   TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_notif_pend ON notificaciones (usuario_id, created_at DESC) WHERE leida_en IS NULL;


-- =====================================================================
-- 11. VISTAS DE CÁLCULO
-- =====================================================================
-- Avance acumulado por rubro (avances no anulados)
CREATE VIEW vw_avance_rubros AS
SELECT r.id AS obra_rubro_id, r.obra_id, r.cantidad, r.precio_unitario,
       COALESCE(SUM(a.cantidad), 0)                          AS ejecutado,
       COALESCE(SUM(a.cantidad), 0) * r.precio_unitario      AS monto_ejecutado,
       r.cantidad * r.precio_unitario                        AS monto_contrato,
       CASE WHEN r.cantidad > 0 THEN COALESCE(SUM(a.cantidad), 0) / r.cantidad ELSE 0 END AS avance
FROM obra_rubros r
LEFT JOIN avances a ON a.obra_rubro_id = r.id AND a.anulado_en IS NULL
GROUP BY r.id;

-- Material requerido por la obra según rubros × insumos
CREATE VIEW vw_material_requerido AS
SELECT r.obra_id, i.material_id, SUM(r.cantidad * i.cantidad_por_unidad) AS requerido
FROM obra_rubros r
JOIN obra_rubro_insumos i ON i.obra_rubro_id = r.id
GROUP BY r.obra_id, i.material_id;

-- Stock por obra (bodega de la obra) con requerido y consumido
CREATE VIEW vw_stock_obra AS
SELECT b.obra_id, m.id AS material_id, m.codigo, m.nombre, m.unidad,
       COALESCE(s.cantidad, 0) AS stock,
       COALESCE(req.requerido, 0) AS requerido,
       COALESCE((SELECT -SUM(mv.cantidad) FROM movimientos_inventario mv
                  WHERE mv.bodega_id = b.id AND mv.material_id = m.id AND mv.tipo = 'CONSUMO'), 0) AS consumido
FROM bodegas b
CROSS JOIN materiales m
LEFT JOIN stock s ON s.bodega_id = b.id AND s.material_id = m.id
LEFT JOIN vw_material_requerido req ON req.obra_id = b.obra_id AND req.material_id = m.id
WHERE b.tipo = 'OBRA'
  AND (s.cantidad IS NOT NULL OR req.requerido IS NOT NULL);


-- =====================================================================
-- 12. TRIGGERS DE updated_at Y AUDITORÍA
-- =====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios','contratistas','obras','obra_rubros','transferencias','planillas'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['usuarios','usuario_roles','usuario_permisos','rol_permisos','obras','obra_miembros',
                           'obra_requisitos','contratista_documentos','firmas','obra_rubros','avances',
                           'transferencias','planillas','planilla_lineas','costeo_costos','costeo_indirectos'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION fn_auditar()', t);
  END LOOP;
END $$;

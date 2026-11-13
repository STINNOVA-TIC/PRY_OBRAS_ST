-- =====================================================================
-- ST-OBRAS V2 · SEED
-- Catálogos tomados de la app real (config/catalogo, materiales, rendimientos)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Módulos y permisos
-- ---------------------------------------------------------------------
INSERT INTO modulos (codigo, nombre, icono, orden) VALUES
 ('DASHBOARD',    'Inicio',          'home',          1),
 ('OBRAS',        'Obras',           'building',      2),
 ('HABILITACION', 'Habilitación',    'clipboard',     3),
 ('EJECUCION',    'Rubros y avances','list',          4),
 ('BODEGA',       'Bodega',          'package',       5),
 ('PLANILLAS',    'Planillas',       'file-text',     6),
 ('REPORTES',     'Reportes',        'chart',         7),
 ('COSTEO',       'Costeo privado',  'lock',          8),
 ('CONTRATISTAS', 'Contratistas',    'truck',         9),
 ('CONFIG',       'Configuración',   'settings',     10),
 ('USUARIOS',     'Usuarios',        'users',        11),
 ('ROLES',        'Roles',           'shield',       12),
 ('BITACORA',     'Bitácora',        'history',      13);

INSERT INTO permisos (modulo_id, codigo, accion, descripcion)
SELECT m.id, p.codigo, p.accion, p.descripcion
FROM (VALUES
  ( 1,'OBRAS','obras.ver','VER','Ver las obras donde es miembro'),
  ( 2,'OBRAS','obras.ver_todas','VER','Ver todas las obras aunque no sea miembro'),
  ( 3,'OBRAS','obras.crear','CREAR','Crear obras'),
  ( 4,'OBRAS','obras.editar','EDITAR','Editar datos de la obra'),
  ( 5,'OBRAS','obras.eliminar','ELIMINAR','Eliminar obras'),
  ( 6,'OBRAS','obras.gestionar_equipo','GESTIONAR','Agregar o quitar miembros y designar firmantes'),
  ( 7,'OBRAS','obras.cambiar_estado','GESTIONAR','Suspender, reactivar o cerrar obras'),
  ( 8,'HABILITACION','habilitacion.cargar','EDITAR','Cargar requisitos y documentos de contratistas'),
  ( 9,'HABILITACION','habilitacion.revisar','APROBAR','Dar OK a los requisitos administrativos'),
  (10,'HABILITACION','habilitacion.revisar_sig','APROBAR','Dar OK a documentos de contratistas (SIG)'),
  (11,'HABILITACION','habilitacion.firmar','FIRMAR','Firmar la aprobación de habilitación (si es designado)'),
  (12,'HABILITACION','habilitacion.reemplazo','FIRMAR','Firmar en reemplazo del superintendente'),
  (13,'HABILITACION','habilitacion.accesos_externos','GESTIONAR','Crear códigos de acceso externos'),
  (14,'CONTRATISTAS','contratistas.ver','VER','Ver contratistas'),
  (15,'CONTRATISTAS','contratistas.gestionar','GESTIONAR','Crear y editar contratistas'),
  (16,'EJECUCION','rubros.editar','EDITAR','Editar rubros, insumos y programa de la obra'),
  (17,'EJECUCION','avances.registrar','CREAR','Registrar avances'),
  (18,'EJECUCION','avances.anular','ELIMINAR','Anular avances de otros'),
  (19,'BODEGA','bodega.ver','VER','Ver stock y kardex'),
  (20,'BODEGA','bodega.ingresar','CREAR','Registrar ingresos a bodega'),
  (21,'BODEGA','bodega.consumo','CREAR','Registrar consumos en obra'),
  (22,'BODEGA','bodega.ajustar','EDITAR','Registrar ajustes y reversos'),
  (23,'BODEGA','bodega.transferir','CREAR','Solicitar transferencias entre bodegas'),
  (24,'BODEGA','bodega.firmar_transferencia','FIRMAR','Aprobar, despachar o recibir transferencias (si es designado)'),
  (25,'PLANILLAS','planillas.ver','VER','Ver planillas'),
  (26,'PLANILLAS','planillas.elaborar','CREAR','Elaborar planillas'),
  (27,'PLANILLAS','planillas.firmar','FIRMAR','Firmar planillas (si es designado)'),
  (28,'PLANILLAS','planillas.estado','APROBAR','Observar, marcar pagada o anular planillas'),
  (29,'REPORTES','reportes.ver','VER','Ver reportes y rendimientos'),
  (30,'REPORTES','reportes.exportar','EXPORTAR','Exportar reportes'),
  (31,'COSTEO','costeo.ver','VER','Ver el costeo privado'),
  (32,'COSTEO','costeo.editar','EDITAR','Editar el costeo privado'),
  (33,'CONFIG','config.editar','EDITAR','Editar catálogos, materiales, rendimientos y parámetros'),
  (34,'USUARIOS','usuarios.ver','VER','Listar y ver usuarios'),
  (35,'USUARIOS','usuarios.crear','CREAR','Crear usuarios'),
  (36,'USUARIOS','usuarios.editar','EDITAR','Editar usuarios y su firma'),
  (37,'USUARIOS','usuarios.desactivar','ELIMINAR','Activar y desactivar usuarios'),
  (38,'USUARIOS','usuarios.asignar_roles','GESTIONAR','Asignar roles y excepciones de permisos'),
  (39,'USUARIOS','usuarios.reset_password','EDITAR','Restablecer contraseñas'),
  (40,'ROLES','roles.ver','VER','Ver roles y permisos'),
  (41,'ROLES','roles.crear','CREAR','Crear roles'),
  (42,'ROLES','roles.editar','EDITAR','Editar roles y sus permisos'),
  (43,'ROLES','roles.desactivar','ELIMINAR','Activar y desactivar roles'),
  (44,'BITACORA','bitacora.ver','VER','Ver la bitácora completa'),
  (45,'BODEGA','bodega.central','GESTIONAR','Operar la bodega central: ver su stock y kardex, ingresos y despachos')
) AS p(n, modulo, codigo, accion, descripcion)
JOIN modulos m ON m.codigo = p.modulo
ORDER BY p.n;

-- ---------------------------------------------------------------------
-- Roles (los de la app real + SIG, Bodega central y Contratista)
-- ---------------------------------------------------------------------
INSERT INTO roles (codigo, nombre, descripcion, es_externo) VALUES
 ('SUPERADMIN',      'Propietario',      'Control total: configuración, costeo, bitácora y usuarios', FALSE),
 ('ADMINISTRADOR',   'Administrador',    'Administrador del contrato: gestiona obras, aprueba y cambia estados', FALSE),
 ('SUPERINTENDENTE', 'Superintendente',  'Superintendente de obra: aprueba habilitación y planillas', FALSE),
 ('RESIDENTE',       'Residente',        'Registra avances y consumos; elabora planillas', FALSE),
 ('BODEGUERO',       'Bodeguero',        'Ingresos, consumos y transferencias de bodega', FALSE),
 ('SIG',             'SIG',              'Revisa los documentos habilitantes de contratistas', FALSE),
 ('VISUALIZADOR',    'Visualizador',     'Solo consulta', FALSE),
 ('CONTRATISTA',     'Contratista',      'Sube los documentos de su empresa', TRUE);

-- SUPERADMIN: todo
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.codigo = 'SUPERADMIN';

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM (VALUES
  ('ADMINISTRADOR', ARRAY['obras.ver','obras.crear','obras.editar','obras.gestionar_equipo','obras.cambiar_estado',
     'habilitacion.cargar','habilitacion.revisar','habilitacion.firmar','habilitacion.accesos_externos',
     'contratistas.ver','contratistas.gestionar','rubros.editar','avances.registrar','avances.anular',
     'bodega.ver','bodega.ingresar','bodega.consumo','bodega.ajustar','bodega.transferir','bodega.firmar_transferencia',
     'bodega.central','planillas.ver','planillas.elaborar','planillas.firmar','planillas.estado','reportes.ver','reportes.exportar',
     'usuarios.ver']),
  ('SUPERINTENDENTE', ARRAY['obras.ver','obras.editar','habilitacion.cargar','habilitacion.firmar',
     'contratistas.ver','rubros.editar','avances.registrar','avances.anular',
     'bodega.ver','bodega.ingresar','bodega.consumo','bodega.transferir','bodega.firmar_transferencia',
     'planillas.ver','planillas.elaborar','planillas.firmar','reportes.ver','reportes.exportar','usuarios.ver']),
  ('RESIDENTE', ARRAY['obras.ver','contratistas.ver','avances.registrar','bodega.ver','bodega.consumo',
     'bodega.transferir','bodega.firmar_transferencia','planillas.ver','planillas.elaborar','planillas.firmar','reportes.ver']),
  ('BODEGUERO', ARRAY['obras.ver','bodega.ver','bodega.ingresar','bodega.consumo','bodega.transferir',
     'bodega.firmar_transferencia','bodega.central']),
  ('SIG', ARRAY['obras.ver','obras.ver_todas','contratistas.ver','contratistas.gestionar','habilitacion.cargar','habilitacion.revisar_sig']),
  ('VISUALIZADOR', ARRAY['obras.ver','contratistas.ver','bodega.ver','planillas.ver','reportes.ver']),
  ('CONTRATISTA', ARRAY['obras.ver'])
) AS m(rol, permisos)
JOIN roles r ON r.codigo = m.rol
JOIN permisos p ON p.codigo = ANY (m.permisos);

-- ---------------------------------------------------------------------
-- Parámetros (config/parametros de la app real: t1=5, t2=10)
-- ---------------------------------------------------------------------
INSERT INTO parametros (clave, valor, descripcion) VALUES
 ('UMBRAL_ALERTA_PCT',  '5',  'Desviación de consumo (%) a partir de la cual se marca Atención'),
 ('UMBRAL_CRITICO_PCT', '10', 'Desviación de consumo (%) a partir de la cual se marca Crítico'),
 ('IVA_PCT',            '15', 'IVA aplicado en planillas'),
 ('EMPRESA_NOMBRE',     'INDUSTRIA ST INNOVA S.A.', 'Se imprime en planillas y reportes'),
 ('PLANILLA_APODERADO', 'ING. ALEJANDRO NAVARRETE', 'Apoderado especial que firma las planillas impresas'),
 ('ACCESO_MAX_INTENTOS','5',  'Intentos de carga por documento en accesos externos');

-- ---------------------------------------------------------------------
-- Materiales (config/materiales)
-- ---------------------------------------------------------------------
INSERT INTO materiales (codigo, nombre, unidad) VALUES
 ('m01', 'Pintura termoplástica blanca',   'kg'),
 ('m02', 'Pintura termoplástica amarilla', 'kg'),
 ('m03', 'Microesferas de vidrio',         'kg'),
 ('m04', 'Imprimante (primer)',            'l'),
 ('m05', 'Pintura de tráfico',             'l'),
 ('m06', 'Tacha retroreflectiva',          'u'),
 ('m07', 'Adhesivo bituminoso para tachas','kg'),
 ('m08', 'Gas GLP',                        'kg'),
 ('m09', 'Solvente',                       'l');

-- ---------------------------------------------------------------------
-- Catálogo de rubros (config/catalogo) con clase automática
-- ---------------------------------------------------------------------
INSERT INTO catalogo_rubros (codigo, descripcion, unidad, clase) VALUES
 ('c01', 'Marca de pavimento termoplástica, línea continua',   'm',  'TERMO'),
 ('c02', 'Marca de pavimento termoplástica, línea segmentada', 'm',  'TERMO'),
 ('c03', 'Flechas, leyendas y pasos cebra termoplásticos',     'm²', 'TERMO'),
 ('c04', 'Marca de pavimento con pintura de tráfico',          'm',  NULL),
 ('c05', 'Tacha retroreflectiva bidireccional',                'u',  'TACHAS'),
 ('c06', 'Tacha retroreflectiva unidireccional',               'u',  'TACHAS'),
 ('c07', 'Microesferas de vidrio retroreflectivas',            'kg', NULL),
 ('c08', 'Señal vertical preventiva',                          'u',  NULL),
 ('c09', 'Señal vertical reglamentaria',                       'u',  NULL),
 ('c10', 'Señal vertical informativa',                         'u',  NULL),
 ('c11', 'Delineador de ruta',                                 'u',  NULL),
 ('c12', 'Guardavía metálica doble onda',                      'm',  NULL),
 ('c13', 'Borrado de marcas existentes',                       'm²', NULL);

-- Insumos usados en las obras reales (Babahoyo–Jujan)
INSERT INTO catalogo_rubro_insumos (catalogo_rubro_id, material_id, cantidad_por_unidad)
SELECT cr.id, m.id, x.r
FROM (VALUES ('c01','m01',0.7692),('c01','m03',0.0769),('c01','m04',0.0237),
             ('c02','m01',0.7692),('c02','m03',0.0769),('c02','m04',0.0237),
             ('c05','m06',1),('c05','m07',0.08),('c06','m06',1),('c06','m07',0.08)) AS x(rubro, mat, r)
JOIN catalogo_rubros cr ON cr.codigo = x.rubro
JOIN materiales m ON m.codigo = x.mat;

-- ---------------------------------------------------------------------
-- Rendimientos (config/rendimientos)
-- ---------------------------------------------------------------------
INSERT INTO rendimientos (codigo, nombre, tipo, clase, unidad, factor, unidad_base, factor_base, minimo, bueno, ideal, maximo) VALUES
 ('r_termo',   'Termoplástico en línea de 15 cm',           'REND',  'TERMO',  't',               1000,  NULL,         NULL, 1250, NULL, 1300, 1350),
 ('r_micro',   'Microesferas por tonelada de termoplástico','DOSIS', NULL,     'kg',              1,     't de termo', 1000, 90,   NULL, 100,  120),
 ('r_primer',  'Imprimante (primer)',                       'REND',  'TERMO',  'caneca de 5 gal', 18.93, NULL,         NULL, 800,  850,  1000, NULL),
 ('r_bitumen', 'Adhesivo bituminoso para tachas',           'REND',  'TACHAS', 'caja de 20 kg',   20,    NULL,         NULL, 180,  NULL, 250,  280);

INSERT INTO rendimiento_materiales (rendimiento_id, material_id, rol)
SELECT r.id, m.id, x.rol
FROM (VALUES ('r_termo','m01','MAT'),('r_termo','m02','MAT'),
             ('r_micro','m03','MAT'),('r_micro','m01','BASE'),('r_micro','m02','BASE'),
             ('r_primer','m04','MAT'),('r_bitumen','m07','MAT')) AS x(rend, mat, rol)
JOIN rendimientos r ON r.codigo = x.rend
JOIN materiales m ON m.codigo = x.mat;

-- ---------------------------------------------------------------------
-- Habilitación: requisitos administrativos y documentos de contratistas
-- ---------------------------------------------------------------------
INSERT INTO tipos_requisito (codigo, nombre, texto_confirmacion, etiqueta_ref, etiqueta_fecha, etiqueta_adjunto, es_monto, orden) VALUES
 ('PRECIOS_MTK', 'Precios de MTK para negociar', 'Confirmo que MTK entregó el documento con los precios para negociar', 'N.º o referencia del documento', 'Fecha del documento', 'Documento de precios de MTK', FALSE, 1),
 ('COTIZACION',  'Cotización aprobada',          'Confirmo que el cliente aprobó la cotización',                         'N.º de cotización',             'Fecha de aprobación', 'Cotización aprobada',         FALSE, 2),
 ('CONTRATO',    'Contrato firmado',             'Confirmo que el contrato está firmado por ambas partes',                'N.º o código del contrato',     'Fecha de firma',      'Contrato firmado',            FALSE, 3),
 ('ANTICIPO',    'Anticipo recibido',            'Confirmo la recepción del anticipo en cuenta',                          'Monto recibido (USD)',          'Fecha de recepción',  'Comprobante de acreditación', TRUE,  4);

INSERT INTO tipos_documento_contratista (codigo, nombre, vence, orden) VALUES
 ('RUC',   'RUC actualizado',                                   FALSE, 1),
 ('RL',    'Nombramiento y cédula del representante legal',     FALSE, 2),
 ('IESS',  'Certificado de cumplimiento de obligaciones IESS',  TRUE,  3),
 ('SRI',   'Certificado de cumplimiento tributario SRI',        TRUE,  4),
 ('FIEL',  'Póliza o garantía de fiel cumplimiento',            TRUE,  5),
 ('ANTIC', 'Póliza o garantía de buen uso de anticipo',         TRUE,  6),
 ('SUB',   'Subcontrato firmado',                               FALSE, 7);

-- ---------------------------------------------------------------------
-- Bodega central (el stock global se segmenta: central + una bodega por obra)
-- ---------------------------------------------------------------------
INSERT INTO bodegas (codigo, nombre, tipo) VALUES ('CENTRAL', 'Bodega central', 'CENTRAL');

-- ---------------------------------------------------------------------
-- Usuario propietario inicial
--   email:    admin@stinnova.com
--   password: Cambiar123!   (pide cambiarla en el primer ingreso)
-- ---------------------------------------------------------------------
INSERT INTO usuarios (nombre, email, password_hash, cargo, requiere_cambio_password)
VALUES ('Administrador', 'admin@stinnova.com', crypt('Cambiar123!', gen_salt('bf', 10)), 'Propietario', TRUE);

INSERT INTO usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u, roles r
WHERE u.email = 'admin@stinnova.com' AND r.codigo = 'SUPERADMIN';

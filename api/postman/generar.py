"""
Genera UNA colección Postman v2.1 con variables incluidas (sin entorno aparte).
  python generar.py                     → st-obras-v2.postman_collection.json
  python generar.py --firma f.png --pdf d.pdf → además, una copia para Newman con la imagen de firma
Probar:  npx newman run st-obras-v2.postman_collection.json
"""
import json, re, sys, uuid

ARCHIVO = "st-obras-v2.postman_collection.json"
VARIABLES = {
    "baseUrl": "http://localhost:3000/api",
    "adminEmail": "admin@stinnova.com",
    "adminPassword": "Cambiar123!",
    "token": "", "miId": "", "tokenResidente": "",
    "rolAdministrador": "", "rolSuperintendente": "", "rolResidente": "", "rolSuperadmin": "",
    "permObrasVer": "", "permObrasCrear": "", "rolNuevoId": "",
    "supId": "", "resId": "", "resEmail": "", "passwordTemporal": "",
    "obraId": "", "obraTmpId": "",
    "supEmail": "", "tokenSup": "", "rolSig": "", "sigEmail": "", "tokenSig": "",
    "ctrId": "", "pdfId": "", "ocId": "",
    "bodegaCentralId": "", "bodegaObraId": "", "rolBodeguero": "", "bodEmail": "", "tokenBodeguero": "", "transfId": "", "transf2Id": "", "movId": "",
    "docHabId": "", "matId": "",
    "hoy": "", "rubroId": "", "rubro2Id": "", "rubroManualId": "", "avanceId": "", "avanceResId": "",
    "doc_RUC": "", "doc_RL": "", "doc_IESS": "", "doc_SRI": "", "doc_FIEL": "", "doc_ANTIC": "", "doc_SUB": "",
}

def st(c): return [f"pm.test('Status {c}', () => pm.response.to.have.status({c}));"]
def g(var, expr): return [f"pm.collectionVariables.set('{var}', {expr});"]
def j(var, campo): return g(var, f"pm.response.json().{campo}")
def ok(nombre, cond): return [f"pm.test('{nombre}', () => pm.expect({cond}).to.be.true);"]
def msg(t): return [f"pm.test('Mensaje: {t}', () => pm.expect(JSON.stringify(pm.response.json().message)).to.include('{t}'));"]
def num(v): return f"__NUM:{v}__"
SIN_HASH = ["pm.test('No expone el hash', () => pm.expect(pm.response.text()).to.not.include('passwordHash'));"]
R = "pm.response.json()"

# (carpeta, nombre, método, ruta, body, auth, tests, extra)  auth: None=colección, 'no', 'residente'
P = [
  ("0. Salud", "Health", "GET", "/health", None, "no", st(200), {}),

  ("1. Auth", "Login (guarda token)", "POST", "/auth/login", {"email": "{{adminEmail}}", "password": "{{adminPassword}}"}, "no",
   st(200) + j("token", "accessToken") + j("miId", "usuario.id") + ok("Es propietario", f"{R}.usuario.roles.includes('SUPERADMIN')"), {}),
  ("1. Auth", "Login incorrecto → 401", "POST", "/auth/login", {"email": "{{adminEmail}}", "password": "mala"}, "no", st(401), {}),
  ("1. Auth", "Sin token → 401", "GET", "/obras", None, "no", st(401), {}),
  ("1. Auth", "Mi sesión", "GET", "/auth/me", None, None, st(200) + ok("Trae permisos", f"{R}.permisos.length > 40"), {}),
  ("1. Auth", "Mi perfil", "GET", "/auth/perfil", None, None, st(200) + SIN_HASH, {}),
  ("1. Auth", "Subir mi firma (elige una imagen PNG/JPG)", "PUT", "/auth/firma", "FIRMA", None,
   st(200) + ok("Firma registrada", f"{R}.tieneFirma === true"), {}),

  ("2. Catálogos", "Catálogos de configuración", "GET", "/catalogos", None, None,
   st(200) + ok("9 materiales", f"{R}.materiales.length >= 9") + ok("4 requisitos", f"{R}.tiposRequisito.length === 4")
   + ok("7 documentos de contratista", f"{R}.tiposDocumento.length === 7") + ok("Bodega central", f"{R}.bodegas.some(b => b.tipo === 'CENTRAL')"), {}),

  ("3. Roles", "Listar roles (guarda ids)", "GET", "/roles", None, None,
   st(200) + ["const r = {}; pm.response.json().forEach(x => r[x.codigo] = x.id);"]
   + g("rolAdministrador", "r.ADMINISTRADOR") + g("rolSuperintendente", "r.SUPERINTENDENTE") + g("rolResidente", "r.RESIDENTE") + g("rolSuperadmin", "r.SUPERADMIN") + g("rolSig", "r.SIG") + g("rolBodeguero", "r.BODEGUERO"), {}),
  ("3. Roles", "Catálogo de permisos (guarda ids)", "GET", "/permisos", None, None,
   st(200) + ["const p = {}; pm.response.json().forEach(m => m.permisos.forEach(x => p[x.codigo] = x.id));"]
   + g("permObrasVer", "p['obras.ver']") + g("permObrasCrear", "p['obras.crear']"), {}),
  ("3. Roles", "Crear rol", "POST", "/roles", {"codigo": "JEFE_OBRA_{{$timestamp}}", "nombre": "Jefe de obra", "permisoIds": [num("permObrasVer")]}, None,
   st(201) + j("rolNuevoId", "id"), {}),
  ("3. Roles", "Reemplazar permisos del rol", "PUT", "/roles/{{rolNuevoId}}/permisos", {"permisoIds": [num("permObrasVer"), num("permObrasCrear")]}, None,
   st(200) + ok("2 permisos", f"{R}.permisos.length === 2"), {}),
  ("3. Roles", "Desactivar rol nuevo", "PATCH", "/roles/{{rolNuevoId}}/desactivar", None, None, st(200), {}),
  ("3. Roles", "Desactivar Propietario → 400", "PATCH", "/roles/{{rolSuperadmin}}/desactivar", None, None, st(400), {}),

  ("4. Usuarios", "Crear superintendente (con contraseña)", "POST", "/usuarios",
   {"nombre": "Diego Domínguez", "email": "diego.{{$timestamp}}@stinnova.com", "cargo": "Superintendente de obra", "password": "Diego2026x", "rolIds": [num("rolSuperintendente")]}, None,
   st(201) + j("supId", "id") + j("supEmail", "email") + SIN_HASH, {}),
  ("4. Usuarios", "Crear residente (contraseña temporal)", "POST", "/usuarios",
   {"nombre": "Javier Mora", "email": "javier.{{$timestamp}}@stinnova.com", "cargo": "Residente de obra", "rolIds": [num("rolResidente")]}, None,
   st(201) + j("resId", "id") + j("resEmail", "email") + j("passwordTemporal", "passwordTemporal") + ok("Devuelve temporal", f"typeof {R}.passwordTemporal === 'string'"), {}),
  ("4. Usuarios", "Email repetido → 409", "POST", "/usuarios", {"nombre": "Otro", "email": "{{resEmail}}"}, None, st(409), {}),
  ("4. Usuarios", "Listar usuarios", "GET", "/usuarios?page=1&limit=20", None, None, st(200) + SIN_HASH, {}),
  ("4. Usuarios", "Editar cargo", "PATCH", "/usuarios/{{resId}}", {"cargo": "Residente de obra civil"}, None,
   st(200) + ok("Cargo actualizado", f"{R}.cargo === 'Residente de obra civil'"), {}),
  ("4. Usuarios", "Login del residente (guarda su token)", "POST", "/auth/login", {"email": "{{resEmail}}", "password": "{{passwordTemporal}}"}, "no",
   st(200) + j("tokenResidente", "accessToken") + ok("Debe cambiar contraseña", f"{R}.usuario.requiereCambioPassword === true"), {}),

  ("5. Obras", "Crear obra (guarda obraId)", "POST", "/obras",
   {"nombre": "VINCES-MACUL 3 · {{$timestamp}}", "cliente": "CCECC", "provincia": "GUAYAS Y LOS RIOS", "plazoTexto": "1 mes", "fechaInicio": "2026-09-01", "fechaFin": "2026-10-30"}, None,
   st(201) + j("obraId", "id") + ok("Empieza en habilitación", f"{R}.estado === 'HABILITACION'")
   + ok("Creador queda como Administrador", f"{R}.miFuncion === 'ADMINISTRADOR'") + ok("Tiene su bodega", f"!!{R}.bodegaId"), {}),
  ("5. Obras", "Listar obras", "GET", "/obras", None, None, st(200), {}),
  ("5. Obras", "Editar con fechas invertidas → 400", "PATCH", "/obras/{{obraId}}", {"fechaFin": "2026-08-01"}, None, st(400), {}),
  ("5. Obras", "Editar ubicación", "PATCH", "/obras/{{obraId}}", {"ubicacion": "Vinces – Macul"}, None, st(200), {}),
  ("5. Obras", "Agregar superintendente", "PUT", "/obras/{{obraId}}/miembros/{{supId}}", {"funcion": "SUPERINTENDENTE"}, None, st(200), {}),
  ("5. Obras", "Agregar residente", "PUT", "/obras/{{obraId}}/miembros/{{resId}}", {"funcion": "RESIDENTE"}, None,
   st(200) + ok("3 miembros", f"{R}.miembros.length === 3"), {}),
  ("5. Obras", "Firmante superintendente = residente → 400", "PATCH", "/obras/{{obraId}}/firmantes", {"superintendenteId": "{{resId}}"}, None, st(400), {}),
  ("5. Obras", "Designar firmantes de habilitación", "PATCH", "/obras/{{obraId}}/firmantes", {"administradorId": "{{miId}}", "superintendenteId": "{{supId}}"}, None,
   st(200) + ok("Superintendente designado", f"{R}.superintendenteId === pm.collectionVariables.get('supId')"), {}),
  ("5. Obras", "Quitar a un firmante → 400", "DELETE", "/obras/{{obraId}}/miembros/{{supId}}", None, None, st(400), {}),
  ("5. Obras", "Activar sin firmas → 400", "PATCH", "/obras/{{obraId}}/estado", {"estado": "ACTIVA", "motivo": "Intento sin firmas"}, None,
   st(400) + msg("firmas de habilitación"), {}),
  ("5. Obras", "Residente ve su obra", "GET", "/obras/{{obraId}}", None, "residente",
   st(200) + ok("Su función es Residente", f"{R}.miFuncion === 'RESIDENTE'"), {}),
  ("5. Obras", "Residente no puede crear obras → 403", "POST", "/obras", {"nombre": "No permitido"}, "residente", st(403), {}),
  ("5. Obras", "Crear obra temporal", "POST", "/obras", {"nombre": "Obra temporal {{$timestamp}}"}, None, st(201) + j("obraTmpId", "id"), {}),
  ("5. Obras", "Residente no ve obra ajena → 404", "GET", "/obras/{{obraTmpId}}", None, "residente", st(404), {}),
  ("5. Obras", "Eliminar obra temporal", "DELETE", "/obras/{{obraTmpId}}", None, None, st(200), {}),
]

H = "/obras/{{obraId}}/habilitacion"
REQS = [("PRECIOS_MTK", {"referencia": "MTK-001"}), ("COTIZACION", {"referencia": "356-COT"}),
        ("CONTRATO", {"referencia": "CT-2026-15"}), ("ANTICIPO", {"referencia": "TRF-889", "monto": 15000.5})]
DOCS = ["RUC", "RL", "IESS", "SRI", "FIEL", "ANTIC", "SUB"]
VENCE = {"IESS", "SRI", "FIEL", "ANTIC"}
P += [
  ("6. Contratistas", "Crear contratista (RUC único)", "POST", "/contratistas",
   {"ruc": "{{$timestamp}}001", "razonSocial": "JEHOVIAL S.A.", "representanteLegal": "Denis Castro"}, None, st(201) + j("ctrId", "id"), {}),
  ("6. Contratistas", "RUC inválido → 400", "POST", "/contratistas", {"ruc": "123", "razonSocial": "Otro"}, None, st(400), {}),
  ("6. Contratistas", "Listar contratistas", "GET", "/contratistas", None, None,
   st(200) + ok("Incluye el nuevo", f"{R}.some(c => c.id === pm.collectionVariables.get('ctrId'))"), {}),

  ("7. Habilitación", "Subir PDF de respaldo (elige un PDF)", "POST", "/archivos", "PDF", None, st(201) + j("pdfId", "id"), {}),
  ("7. Habilitación", "Estado inicial", "GET", H, None, None,
   st(200) + ok("4 requisitos", f"{R}.requisitos.length === 4") + ok("2 firmas", f"{R}.firmas.length === 2")
   + ok("No completo", f"{R}.progreso.completo === false"), {}),
  ("7. Habilitación", "Firmar incompleto → 400", "POST", H + "/firmar", {}, None, st(400), {}),
  ("7. Habilitación", "OK sin cargar → 400", "POST", H + "/requisitos/CONTRATO/revision", {"ok": True}, None, st(400), {}),
]
for cod, extra in REQS:
    P.append(("7. Habilitación", f"Cargar requisito {cod}", "PUT", f"{H}/requisitos/{cod}",
              {**extra, "fecha": "2026-10-15", "archivoId": "{{pdfId}}", "confirmado": True}, None,
              st(200) + ok("Falta OK", f"{R}.requisitos.find(r => r.codigo === '{cod}').estado === 'FALTA_OK'"), {}))
for cod, _ in REQS:
    P.append(("7. Habilitación", f"OK de revisión {cod}", "POST", f"{H}/requisitos/{cod}/revision", {"ok": True}, None,
              st(200) + ok("OK", f"{R}.requisitos.find(r => r.codigo === '{cod}').estado === 'OK'"), {}))
P += [
  ("7. Habilitación", "Agregar contratista a la obra", "POST", H + "/contratistas", {"contratistaId": "{{ctrId}}", "objeto": "Señalización horizontal"}, None,
   st(200) + j("ocId", "contratistas[0].id") + ok("7 documentos", f"{R}.contratistas[0].documentos.length === 7"), {}),
  ("7. Habilitación", "Contratista repetido → 409", "POST", H + "/contratistas", {"contratistaId": "{{ctrId}}"}, None, st(409), {}),
  ("7. Habilitación", "IESS sin vencimiento → 400", "PUT", H + "/contratistas/{{ocId}}/documentos/IESS", {"archivoId": "{{pdfId}}"}, None, st(400), {}),
]
for d in DOCS:
    body = {"archivoId": "{{pdfId}}", **({"vence": "2027-12-31"} if d in VENCE else {})}
    P.append(("7. Habilitación", f"Subir documento {d}", "PUT", f"{H}/contratistas/{{{{ocId}}}}/documentos/{d}", body, None, st(200), {}))
P += [
  ("7. Habilitación", "Crear usuario SIG", "POST", "/usuarios",
   {"nombre": "Ana SIG", "email": "sig.{{$timestamp}}@stinnova.com", "cargo": "Analista SIG", "password": "Sig2026xx", "rolIds": [num("rolSig")]}, None,
   st(201) + j("sigEmail", "email"), {}),
  ("7. Habilitación", "Login SIG (guarda token)", "POST", "/auth/login", {"email": "{{sigEmail}}", "password": "Sig2026xx"}, "no",
   st(200) + j("tokenSig", "accessToken"), {}),
  ("7. Habilitación", "SIG ve la obra sin ser miembro (guarda ids de documentos)", "GET", H, None, "tok:tokenSig",
   st(200) + [f"{R}.contratistas[0].documentos.forEach(d => pm.collectionVariables.set('doc_' + d.codigo, d.documento.id));"]
   + ok("Todos pendientes", f"{R}.contratistas[0].documentos.every(d => d.estado === 'PENDIENTE')"), {}),
  ("7. Habilitación", "Residente aprueba → 403", "POST", H + "/documentos/{{doc_RUC}}/revision", {"estado": "APROBADO"}, "residente", st(403), {}),
  ("7. Habilitación", "Rechazar sin motivo → 400", "POST", H + "/documentos/{{doc_SRI}}/revision", {"estado": "RECHAZADO"}, "tok:tokenSig", st(400), {}),
]
for d in DOCS:
    P.append(("7. Habilitación", f"SIG aprueba {d}", "POST", f"{H}/documentos/{{{{doc_{d}}}}}/revision", {"estado": "APROBADO"}, "tok:tokenSig", st(200), {}))
P += [
  ("7. Habilitación", "Todo completo", "GET", H, None, None, st(200) + ok("Completo", f"{R}.progreso.completo === true"), {}),
  ("7. Habilitación", "Login superintendente (guarda token)", "POST", "/auth/login", {"email": "{{supEmail}}", "password": "Diego2026x"}, "no",
   st(200) + j("tokenSup", "accessToken"), {}),
  ("7. Habilitación", "Bandeja de firmas del superintendente", "GET", "/firmas/pendientes", None, "tok:tokenSup",
   st(200) + ok("Obra lista para firmar", f"{R}.some(f => f.obraId === pm.collectionVariables.get('obraId') && f.listo)"), {}),
  ("7. Habilitación", "Residente firma → 403", "POST", H + "/firmar", {}, "residente", st(403), {}),
  ("7. Habilitación", "Administrador firma", "POST", H + "/firmar", {}, None,
   st(200) + ok("Firma estampada", f"{R}.firmas.find(f => f.rol === 'ADMINISTRADOR').firmado === true")
   + ok("Sigue en habilitación", f"{R}.obra.estado === 'HABILITACION'"), {}),
  ("7. Habilitación", "Firmar dos veces → 409", "POST", H + "/firmar", {}, None, st(409), {}),
  ("7. Habilitación", "Superintendente sin firma registrada → 400", "POST", H + "/firmar", {}, "tok:tokenSup", st(400) + msg("firma registrada"), {}),
  ("7. Habilitación", "Superintendente sube su firma (elige imagen)", "PUT", "/auth/firma", "FIRMA", "tok:tokenSup", st(200), {}),
  ("7. Habilitación", "Superintendente firma → obra ACTIVA", "POST", H + "/firmar", {}, "tok:tokenSup",
   st(200) + ok("Obra activa", f"{R}.obra.estado === 'ACTIVA'"), {}),
  ("7. Habilitación", "Editar requisito con obra activa → 403", "PUT", H + "/requisitos/CONTRATO", {"referencia": "x"}, None, st(403) + msg("ACTIVA"), {}),
]

# ---------------------------------------------------------------- Fase 3 (la obra quedó ACTIVA en la carpeta 7)
RB = "/obras/{{obraId}}/rubros"
AV = "/obras/{{obraId}}/avances"
P += [
  ("8. Rubros", "Agregar desde catálogo", "POST", RB + "/desde-catalogo",
   {"items": [{"catalogoRubroId": 1, "cantidad": 10000, "precioUnitario": 1.85}, {"catalogoRubroId": 5, "cantidad": 500, "precioUnitario": 6.4}]}, None,
   st(201) + ok("2 agregados", f"{R}.agregados === 2")
   + g("hoy", "new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)"), {}),
  ("8. Rubros", "Catálogo repetido → 409", "POST", RB + "/desde-catalogo", {"items": [{"catalogoRubroId": 1, "cantidad": 5}]}, None, st(409), {}),
  ("8. Rubros", "Listar rubros (guarda ids)", "GET", RB, None, None,
   st(200) + j("rubroId", "rubros[0].id") + j("rubro2Id", "rubros[1].id")
   + ok("Insumos copiados", f"{R}.rubros[0].insumos.length > 0") + ok("Monto del contrato", f"{R}.totales.montoContrato === 21700"), {}),
  ("8. Rubros", "Rubro manual con insumos", "POST", RB,
   {"codigo": "705-(3)", "descripcion": "Línea termoplástica segmentada amarilla 10 cm", "unidad": "m", "cantidad": 3200, "precioUnitario": 1.4,
    "insumos": [{"materialId": 1, "cantidadPorUnidad": 0.51}]}, None,
   st(201) + j("rubroManualId", "id") + ok("Clase automática TERMO", f"{R}.claseEfectiva === 'TERMO'") + ok("Ancho 10 cm", f"{R}.anchoEfectivo === 10"), {}),
  ("8. Rubros", "Material repetido en insumos → 400", "POST", RB,
   {"descripcion": "Otro rubro", "unidad": "m", "cantidad": 1, "precioUnitario": 1,
    "insumos": [{"materialId": 1, "cantidadPorUnidad": 1}, {"materialId": 1, "cantidadPorUnidad": 2}]}, None, st(400), {}),
  ("8. Rubros", "Residente no edita rubros → 403", "POST", RB, {"descripcion": "No", "unidad": "m", "cantidad": 1, "precioUnitario": 1}, "residente", st(403), {}),
  ("8. Rubros", "Editar cantidad del rubro", "PATCH", RB + "/{{rubro2Id}}", {"cantidad": 600}, None,
   st(200) + ok("Cantidad 600", f"{R}.cantidad === 600"), {}),

  ("9. Avances", "Fecha futura → 400", "POST", AV, {"obraRubroId": "{{rubroId}}", "fecha": "2099-01-01", "cantidad": 10}, None, st(400), {}),
  ("9. Avances", "Abscisa invertida → 400", "POST", AV,
   {"obraRubroId": "{{rubroId}}", "fecha": "{{hoy}}", "cantidad": 10, "abscisaDesde": "96+040", "abscisaHasta": "94+131"}, None, st(400), {}),
  ("9. Avances", "Registrar avance del contratista (guarda id)", "POST", AV,
   {"obraRubroId": "{{rubroId}}", "fecha": "{{hoy}}", "cantidad": 1909, "obraContratistaId": "{{ocId}}", "abscisaDesde": "94+131",
    "abscisaHasta": "96+040", "tramo": "TRAMO 4", "color": "BLANCO", "tipoLinea": "CONTINUA", "numLineas": 1, "frente": "Eje"}, None,
   st(201) + j("avanceId", "avance.id") + ok("Saldo 8091", f"{R}.rubro.saldo === 8091") + ok("Con contratista", f"!!{R}.avance.contratistaNombre"), {}),
  ("9. Avances", "Residente registra (guarda id)", "POST", AV, {"obraRubroId": "{{rubroId}}", "fecha": "{{hoy}}", "cantidad": 1300}, "residente",
   st(201) + j("avanceResId", "avance.id"), {}),
  ("9. Avances", "Residente no anula avance ajeno → 403", "POST", AV + "/{{avanceId}}/anular", {"motivo": "No es mío"}, "residente", st(403), {}),
  ("9. Avances", "Residente anula el suyo", "POST", AV + "/{{avanceResId}}/anular", {"motivo": "Cantidad mal digitada"}, "residente",
   st(200) + ok("Anulado", f"!!{R}.avance.anuladoEn") + ok("Ejecutado vuelve a 1909", f"{R}.rubro.ejecutado === 1909"), {}),
  ("9. Avances", "Anular dos veces → 409", "POST", AV + "/{{avanceResId}}/anular", {"motivo": "Otra vez"}, None, st(409), {}),
  ("9. Avances", "Listar avances vigentes", "GET", AV, None, None, st(200) + ok("1 vigente", f"{R}.total === 1"), {}),
  ("9. Avances", "Listar con anulados", "GET", AV + "?incluirAnulados=true", None, None, st(200) + ok("2 en total", f"{R}.total === 2"), {}),
  ("9. Avances", "Eliminar rubro con avances → 409", "DELETE", RB + "/{{rubroId}}", None, None, st(409), {}),
  ("9. Avances", "Eliminar rubro sin avances", "DELETE", RB + "/{{rubroManualId}}", None, None, st(200), {}),
  ("9. Avances", "La obra muestra el monto ejecutado", "GET", "/obras/{{obraId}}", None, None,
   st(200) + ok("Ejecutado 1909 × 1,85", f"Math.abs({R}.montoEjecutado - 3531.65) < 0.01"), {}),

  ("10. Programa", "Programa calculado", "GET", "/obras/{{obraId}}/programa", None, None,
   st(200) + ok("2 rubros", f"{R}.rubros.length === 2") + ok("Necesidad de material", f"{R}.materiales.length > 0")
   + ok("Pide rendimiento planificado", f"{R}.alertas.some(a => a.nivel === 'PENDIENTE')"), {}),
  ("10. Programa", "Residente no edita el programa → 403", "PUT", "/obras/{{obraId}}/programa", {"diasLaborablesSemana": 5}, "residente", st(403), {}),
  ("10. Programa", "Guardar plazos y rendimientos", "PUT", "/obras/{{obraId}}/programa",
   {"diasLaborablesSemana": 5, "diasCobertura": 10, "rubros": [{"obraRubroId": "{{rubroId}}", "inicio": None, "fin": None, "rendDia": 1300}],
    "stockMinimo": [{"materialId": 1, "cantidad": 2500}]}, None,
   st(200) + ok("5 días por semana", f"{R}.config.diasLaborablesSemana === 5")
   + ok("Rendimiento guardado", f"{R}.rubros.find(r => r.obraRubroId === pm.collectionVariables.get('rubroId')).rendPlanificado === 1300")
   + ok("Stock mínimo fijo", f"{R}.materiales.find(m => m.materialId === 1).minimoFijo === 2500"), {}),
]

# ---------------------------------------------------------------- Fase 4: bodega
BC = "/bodegas/{{bodegaCentralId}}"
BOB = "/bodegas/{{bodegaObraId}}"
TR = "/transferencias/{{transfId}}"
P += [
  ("11. Bodega", "Listar bodegas (guarda ids)", "GET", "/bodegas", None, None,
   st(200) + g("bodegaCentralId", f"{R}.find(b => b.tipo === 'CENTRAL').id")
   + g("bodegaObraId", f"{R}.find(b => b.obraId === pm.collectionVariables.get('obraId')).id"), {}),
  ("11. Bodega", "Crear bodeguero de la central", "POST", "/usuarios",
   {"nombre": "Carlos Bodega", "email": "bodega.{{$timestamp}}@stinnova.com", "cargo": "Bodeguero central", "password": "Bodega2026x", "rolIds": [num("rolBodeguero")]}, None,
   st(201) + j("bodEmail", "email"), {}),
  ("11. Bodega", "Login bodeguero (guarda token)", "POST", "/auth/login", {"email": "{{bodEmail}}", "password": "Bodega2026x"}, "no",
   st(200) + j("tokenBodeguero", "accessToken"), {}),
  ("11. Bodega", "Bodeguero sube su firma (elige imagen)", "PUT", "/auth/firma", "FIRMA", "tok:tokenBodeguero", st(200), {}),
  ("11. Bodega", "Ingreso a la central", "POST", BC + "/movimientos",
   {"tipo": "INGRESO", "materialId": 1, "cantidad": 5000, "fecha": "{{hoy}}", "documentoRef": "FAC-001-123", "costoUnitario": 2.15}, "tok:tokenBodeguero",
   st(201) + ok("Saldo aumenta 5000", f"{R}.stockNuevo - {R}.stockAnterior === 5000"), {}),
  ("11. Bodega", "Consumo en la central → 400", "POST", BC + "/movimientos", {"tipo": "CONSUMO", "materialId": 1, "cantidad": 1, "fecha": "{{hoy}}"}, None, st(400), {}),
  ("11. Bodega", "Residente no ingresa → 403", "POST", BOB + "/movimientos", {"tipo": "INGRESO", "materialId": 1, "cantidad": 1, "fecha": "{{hoy}}"}, "residente", st(403), {}),
  ("11. Bodega", "Residente no ve el stock de la central → 404", "GET", BC + "/stock", None, "residente", st(404), {}),

  ("12. Transferencias", "Residente sube su firma (elige imagen)", "PUT", "/auth/firma", "FIRMA", "residente", st(200), {}),
  ("12. Transferencias", "Residente pide material a la central", "POST", "/transferencias",
   {"bodegaOrigenId": num("bodegaCentralId"), "bodegaDestinoId": num("bodegaObraId"), "items": [{"materialId": 1, "cantidad": 1200}], "motivo": "Línea continua tramo 4"},
   "residente",
   st(201) + j("transfId", "id") + ok("Solicitud firmada", f"{R}.firmas[0].firmado")
   + ok("Aprueba el administrador", f"{R}.firmas[1].designadoId === pm.collectionVariables.get('miId')"), {}),
  ("12. Transferencias", "Superintendente no designado → 403", "POST", TR + "/aprobar", None, "tok:tokenSup", st(403), {}),
  ("12. Transferencias", "Administrador aprueba", "POST", TR + "/aprobar", None, None, st(200) + ok("APROBADA", f"{R}.estado === 'APROBADA'"), {}),
  ("12. Transferencias", "Quien aprobó no despacha → 403", "POST", TR + "/despachar", {}, None, st(403), {}),
  ("12. Transferencias", "Bodeguero despacha 1000", "POST", TR + "/despachar", {"items": [{"materialId": 1, "cantidad": 1000}], "documentoRef": "GR-0045"},
   "tok:tokenBodeguero", st(200) + ok("En tránsito", f"{R}.estado === 'DESPACHADA'"), {}),
  ("12. Transferencias", "Bodeguero no opera la obra: no recibe → 403", "POST", TR + "/recibir", {}, "tok:tokenBodeguero", st(403), {}),
  ("12. Transferencias", "Recibir menos sin nota → 400", "POST", TR + "/recibir", {"items": [{"materialId": 1, "cantidad": 900}]}, "tok:tokenSup", st(400), {}),
  ("12. Transferencias", "Superintendente recibe 900 con nota", "POST", TR + "/recibir",
   {"items": [{"materialId": 1, "cantidad": 900}], "nota": "100 kg con sacos rotos"}, "tok:tokenSup",
   st(200) + ok("RECIBIDA con 4 firmas", f"{R}.estado === 'RECIBIDA' && {R}.firmas.every(f => f.firmado)"), {}),
  ("12. Transferencias", "Stock de la obra", "GET", BOB + "/stock", None, None,
   st(200) + ok("900 kg", f"{R}.materiales.find(m => m.materialId === 1).stock === 900")
   + ok("Requerido por contrato", f"{R}.materiales.find(m => m.materialId === 1).requerido > 0"), {}),
  ("12. Transferencias", "Residente registra consumo con rubro", "POST", BOB + "/movimientos",
   {"tipo": "CONSUMO", "materialId": 1, "cantidad": 300, "fecha": "{{hoy}}", "obraRubroId": "{{rubroId}}"}, "residente",
   st(201) + j("movId", "id") + ok("Nuevo stock 600", f"{R}.stockNuevo === 600"), {}),
  ("12. Transferencias", "Consumo sin stock → 400", "POST", BOB + "/movimientos", {"tipo": "CONSUMO", "materialId": 1, "cantidad": 99999, "fecha": "{{hoy}}"},
   "residente", st(400), {}),
  ("12. Transferencias", "Residente revierte su consumo", "POST", BOB + "/movimientos/{{movId}}/revertir", {"motivo": "Se digitó dos veces"}, "residente",
   st(201) + ok("Stock vuelve a 900", f"{R}.stockNuevo === 900"), {}),
  ("12. Transferencias", "Kardex de la obra", "GET", BOB + "/movimientos", None, None, st(200) + ok("3 movimientos", f"{R}.total === 3"), {}),
  ("12. Transferencias", "Anular una recibida → 409", "POST", TR + "/anular", {"motivo": "Ya no aplica"}, None, st(409), {}),
]

# ---------------------------------------------------------------- Catálogo e importación
P += [
  ("13. Catálogo", "Crear documento habilitante", "POST", "/catalogo/documentos", {"nombre": "Póliza de vehículos {{$timestamp}}", "vence": True}, None,
   st(201) + j("docHabId", "id"), {}),
  ("13. Catálogo", "Renombrar documento habilitante", "PATCH", "/catalogo/documentos/{{docHabId}}", {"nombre": "Póliza de flota vehicular {{$timestamp}}"}, None, st(200), {}),
  ("13. Catálogo", "Desactivar documento habilitante", "PATCH", "/catalogo/documentos/{{docHabId}}", {"activo": False}, None, st(200), {}),
  ("13. Catálogo", "Residente no edita el catálogo → 403", "POST", "/catalogo/documentos", {"nombre": "No permitido"}, "residente", st(403), {}),
  ("13. Catálogo", "Crear material", "POST", "/catalogo/materiales", {"codigo": "PM-{{$timestamp}}", "nombre": "Material Postman", "unidad": "kg"}, None,
   st(201) + j("matId", "id"), {}),
  ("13. Catálogo", "Editar material", "PATCH", "/catalogo/materiales/{{matId}}", {"costoUnitario": 2.5, "stockMinimo": 100}, None, st(200), {}),
  ("13. Catálogo", "Importar rubros al catálogo (filas ya leídas)", "POST", "/catalogo/rubros/importar",
   {"filas": [{"descripcion": "Marcas sobre el pavimento. Chevrones de piso, color blanco, termoplástica preformado", "unidad": "m2", "precioUnitario": 42}]}, None,
   st(201) + ok("Creado o actualizado", f"{R}.creados + {R}.actualizados === 1"), {}),
  ("13. Catálogo", "Importar rubros a la obra", "POST", "/obras/{{obraId}}/rubros/importar",
   {"filas": [
     {"descripcion": "Marcas de pavimento (Pintura termoplástica), e = 2.3 mm (ancho = 15 cm), con imprimante, color amarillo", "unidad": "m", "cantidad": 12689.33, "precioUnitario": 1.85},
     {"descripcion": "Marcas sobresalidas de pavimento (Tachas Bidireccionales), incluido adhesivo y colocación, color blanco/rojo", "unidad": "u", "cantidad": 3064, "precioUnitario": 6.4}]}, None,
   st(201) + ok("2 creados", f"{R}.creados === 2"), {}),
  ("13. Catálogo", "Reimportar omite existentes", "POST", "/obras/{{obraId}}/rubros/importar",
   {"filas": [{"descripcion": "Marcas sobresalidas de pavimento (Tachas Bidireccionales), incluido adhesivo y colocación, color blanco/rojo", "unidad": "u", "cantidad": 3064, "precioUnitario": 6.4}]}, None,
   st(201) + ok("0 creados", f"{R}.creados === 0"), {}),
  ("13. Catálogo", "Exportar rubros de la obra (Excel)", "GET", "/obras/{{obraId}}/rubros/exportar", None, None,
   st(200) + ok("Es Excel", "pm.response.headers.get('Content-Type').includes('spreadsheetml')"), {}),
  ("13. Catálogo", "Importar ingreso a la bodega de la obra", "POST", "/bodegas/{{bodegaObraId}}/ingresos/importar",
   {"filas": [{"codigo": "GR{{$timestamp}}", "nombre": "Pintura Termo granular saco 20 kg", "unidad": "u", "cantidad": 360}], "fecha": "{{hoy}}", "documentoRef": "GR-001-002-778"}, None,
   st(201) + ok("1 ingreso y 1 material nuevo", f"{R}.ingresos === 1 && {R}.materialesNuevos === 1"), {}),
]

PL = "/obras/{{obraId}}/planillas"
PLI = PL + "/{{planillaId}}"
P += [
  ("14. Planillas", "Resumen de planillas de la obra", "GET", PL, None, "residente",
   st(200) + ok("Puede elaborar", f"{R}.puede.elaborar === true") + ok("Hay ejecutado", f"{R}.cliente.ejecutado > 0"), {}),
  ("14. Planillas", "Propuesta de la siguiente planilla al cliente", "GET", PL + "/propuesta?tipo=CLIENTE", None, "residente",
   st(200) + ok("Es la N.º 1", f"{R}.numero === 1 && {R}.primera === true") + ok("Firmas del impreso", f"{R}.formato.firmas.length === 4"), {}),
  ("14. Planillas", "Crear planilla al cliente (borrador)", "POST", PL,
   {"tipo": "CLIENTE", "multa": 25, "multaDetalle": "Multa por atraso", "formato": {"fiscalizacion": "Consorcio Fiscalizador"}}, "residente",
   st(201) + j("planillaId", "id") + ok("Borrador", f"{R}.estado === 'BORRADOR'") + ok("IVA 15 %", f"Math.abs({R}.totales.iva - {R}.totales.base * 0.15) < 0.01"), {}),
  ("14. Planillas", "Otra planilla con una abierta → 409", "POST", PL, {"tipo": "CLIENTE"}, "residente", st(409), {}),
  ("14. Planillas", "Precio en planilla al cliente → 400", "PATCH", PLI, {"lineas": [{"obraRubroId": "{{rubroId}}", "precioUnitario": 9}]}, "residente", st(400), {}),
  ("14. Planillas", "Corregir cantidad del período (genera alerta)", "PATCH", PLI, {"lineas": [{"obraRubroId": "{{rubroId}}", "cantidadPeriodo": 1500}]}, "residente",
   st(200) + ok("Alerta: difiere de la app", f"{R}.lineas.find(l => l.cantidadPeriodo === 1500).alertas.some(a => a.codigo === 'DIFIERE_APP')"), {}),
  ("14. Planillas", "Volver a lo registrado en la app", "PATCH", PLI, {"lineas": [{"obraRubroId": "{{rubroId}}", "cantidadPeriodo": 1909}]}, "residente", st(200), {}),
  ("14. Planillas", "Superintendente no edita la planilla ajena → 403", "PATCH", PLI, {"multa": 0}, "tok:tokenSup", st(403), {}),
  ("14. Planillas", "Residente firma y presenta", "POST", PLI + "/presentar", None, "residente",
   st(200) + ok("Presentada", f"{R}.estado === 'PRESENTADA'") + ok("3 pasos", f"{R}.firmas.length === 3 && {R}.firmas[0].firmado"), {}),
  ("14. Planillas", "Avance en un período presentado → 400", "POST", "/obras/{{obraId}}/avances",
   {"obraRubroId": "{{rubroId}}", "fecha": "{{hoy}}", "cantidad": 5}, "residente", st(400) + msg("ya está en"), {}),
  ("14. Planillas", "Bandeja del superintendente: revisar", "GET", "/firmas/pendientes", None, "tok:tokenSup",
   st(200) + ok("Planilla pendiente", f"{R}.some(x => x.tipo === 'PLANILLA' && x.rol === 'REVISADO')"), {}),
  ("14. Planillas", "Admin fuera de turno → 403", "POST", PLI + "/firmar", None, None, st(403), {}),
  ("14. Planillas", "Superintendente revisa", "POST", PLI + "/firmar", None, "tok:tokenSup", st(200) + ok("Sigue presentada", f"{R}.estado === 'PRESENTADA'"), {}),
  ("14. Planillas", "Admin aprueba", "POST", PLI + "/firmar", None, None, st(200) + ok("Aprobada", f"{R}.estado === 'APROBADA'"), {}),
  ("14. Planillas", "Exportar planilla (Excel)", "GET", PLI + "/exportar", None, None,
   st(200) + ok("Es Excel", "pm.response.headers.get('Content-Type').includes('spreadsheetml')"), {}),
  ("14. Planillas", "Residente no marca pagada → 403", "POST", PLI + "/pagar", {"fecha": "{{hoy}}"}, "residente", st(403), {}),
  ("14. Planillas", "Marcar pagada", "POST", PLI + "/pagar", {"fecha": "{{hoy}}", "referencia": "TRF-0001"}, None,
   st(200) + ok("Pagada", f"{R}.estado === 'PAGADA' && {R}.pagoRef === 'TRF-0001'"), {}),
  ("14. Planillas", "Anular una pagada → 409", "POST", PLI + "/anular", {"motivo": "Prueba de anulación"}, None, st(409), {}),
  ("14. Planillas", "Propuesta para el contratista", "GET", PL + "/propuesta?tipo=CONTRATISTA&obraContratistaId={{ocId}}", None, "residente",
   st(200) + ok("Solo sus rubros", f"{R}.lineas.length >= 1"), {}),
  ("14. Planillas", "Planilla de contratista con precio de subcontrato", "POST", PL,
   {"tipo": "CONTRATISTA", "obraContratistaId": "{{ocId}}", "lineas": [{"obraRubroId": "{{rubroId}}", "precioUnitario": 1.1}]}, "residente",
   st(201) + j("planillaCtrId", "id") + ok("Subtotal con precio de subcontrato", f"{R}.totales.subtotal > 0"), {}),
  ("14. Planillas", "Eliminar el borrador del contratista", "DELETE", PL + "/{{planillaCtrId}}", None, "residente", st(200), {}),
]

P += [
  ("15. Fase 6", "Bitácora (últimos eventos)", "GET", "/bitacora?limite=20", None, None,
   st(200) + ok("Trae eventos con módulo", f"{R}.datos.every(e => e.modulo)"), {}),
  ("15. Fase 6", "Bitácora de la obra con cambios", "GET", "/bitacora?obraId={{obraId}}", None, None, st(200) + ok("Solo de la obra", f"{R}.datos.every(e => e.obraId === pm.collectionVariables.get('obraId'))"), {}),
  ("15. Fase 6", "Bitácora: accesos (ingresos)", "GET", "/bitacora?modulo=ACCESO&limite=5", None, None, st(200), {}),
  ("15. Fase 6", "Bitácora: residente sin permiso → 403", "GET", "/bitacora", None, "residente", st(403), {}),
  ("15. Fase 6", "Filtros de la bitácora", "GET", "/bitacora/filtros", None, None, st(200), {}),
  ("15. Fase 6", "Parámetros", "GET", "/catalogo/parametros", None, None, st(200) + ok("Incluye el IVA", f"{R}.some(p => p.clave === 'IVA_PCT')"), {}),
  ("15. Fase 6", "Parámetros inválidos → 400", "PUT", "/catalogo/parametros", {"parametros": [{"clave": "UMBRAL_CRITICO_PCT", "valor": "1"}]}, None, st(400), {}),
  ("15. Fase 6", "Rendimientos", "GET", "/catalogo/rendimientos", None, None, st(200), {}),
  ("15. Fase 6", "Reporte de la obra", "GET", "/obras/{{obraId}}/reporte", None, None,
   st(200) + ok("Tiene rubros y rendimientos", f"{R}.rubros.length > 0 && Array.isArray({R}.rendimientos)"), {}),
  ("15. Fase 6", "Exportar reporte (Excel)", "GET", "/obras/{{obraId}}/reporte/exportar", None, None,
   st(200) + ok("Es Excel", "pm.response.headers.get('Content-Type').includes('spreadsheetml')"), {}),
  ("15. Fase 6", "Reporte general", "GET", "/reportes/general", None, None, st(200) + ok("Totales", f"{R}.totales.contratado >= 0"), {}),
  ("15. Fase 6", "Costeo: estado del código", "GET", "/costeo/estado", None, None, st(200), {}),
  ("15. Fase 6", "Costeo sin desbloquear → 403", "GET", "/costeo/obras", None, None, st(403) + msg("COSTEO_BLOQUEADO"), {}),
  ("15. Fase 6", "Enlace de carga: documentos del contratista", "POST", "/obras/{{obraId}}/accesos",
   {"tipo": "CONTRATISTA", "obraContratistaId": "{{ocId}}", "nombre": "Contratista", "email": "contratista@ejemplo.com"}, None,
   st(201) + j("accesoId", "id") + j("accesoToken", "token"), {}),
  ("15. Fase 6", "Página pública del enlace (sin sesión)", "GET", "/publico/cargas/{{accesoToken}}", None, "no",
   st(200) + ok("Pide los documentos", f"{R}.documentos.length > 0 && {R}.abierto"), {}),
  ("15. Fase 6", "Enlaces de la obra", "GET", "/obras/{{obraId}}/accesos", None, None, st(200), {}),
  ("15. Fase 6", "Cancelar el enlace", "POST", "/obras/{{obraId}}/accesos/{{accesoId}}/cancelar", None, None, st(200), {}),
  ("15. Fase 6", "Enlace cancelado ya no recibe", "GET", "/publico/cargas/{{accesoToken}}", None, "no", st(200) + ok("Cerrado", f"!{R}.abierto"), {}),

  ("16. Bodega: rechazo y desglose", "Residente pide más de lo que hay", "POST", "/transferencias",
   {"bodegaOrigenId": num("bodegaCentralId"), "bodegaDestinoId": num("bodegaObraId"), "items": [{"materialId": 1, "cantidad": 999999}]}, "residente",
   st(201) + j("transf2Id", "id"), {}),
  ("16. Bodega: rechazo y desglose", "Administrador aprueba", "POST", "/transferencias/{{transf2Id}}/aprobar", None, None, st(200), {}),
  ("16. Bodega: rechazo y desglose", "Residente no puede rechazar → 403", "POST", "/transferencias/{{transf2Id}}/rechazar", {"motivo": "Falta de stock"}, "residente", st(403), {}),
  ("16. Bodega: rechazo y desglose", "Bodeguero rechaza por falta de stock", "POST", "/transferencias/{{transf2Id}}/rechazar",
   {"motivo": "Falta de stock en la central", "items": [{"materialId": 1, "nota": "Solo quedan 3 sacos"}]}, "tok:tokenBodeguero",
   st(200) + ok("RECHAZADA", f"{R}.estado === 'RECHAZADA'") + ok("Observación por material", f"{R}.items[0].notaDespacho === 'Solo quedan 3 sacos'"), {}),
  ("16. Bodega: rechazo y desglose", "Rechazada no se despacha → 409", "POST", "/transferencias/{{transf2Id}}/despachar", {}, "tok:tokenBodeguero", st(409), {}),
  ("16. Bodega: rechazo y desglose", "De dónde salen requerido y avances", "GET", BOB + "/stock/1/desglose", None, None,
   st(200) + ok("Rubro por rubro", f"Array.isArray({R}.rubros) && {R}.totales.requerido >= 0"), {}),
  ("16. Bodega: rechazo y desglose", "Tablero: facturado vs. cobrado", "GET", "/dashboard", None, None,
   st(200) + ok("12 meses de facturación", f"{R}.facturacion.mensual.length === 12"), {}),
]


def url(ruta):
    camino, _, q = ruta.partition("?")
    u = {"raw": "{{baseUrl}}" + ruta, "host": ["{{baseUrl}}"], "path": [x for x in camino.split("/") if x]}
    if q:
        u["query"] = [{"key": k, "value": v} for k, _, v in (p.partition("=") for p in q.split("&"))]
    return u


def construir(ruta_firma="", ruta_pdf=""):
    carpetas = {}
    for carpeta, nombre, metodo, ruta, body, auth, tests, _ in P:
        req = {"method": metodo, "header": [], "url": url(ruta)}
        if body == "FIRMA":
            req["body"] = {"mode": "formdata", "formdata": [{"key": "archivo", "type": "file", "src": ruta_firma}]}
            req["description"] = "En la pestaña Body elige tu imagen de firma (PNG con fondo transparente recomendado)."
        elif body == "PDF":
            req["body"] = {"mode": "formdata", "formdata": [{"key": "archivo", "type": "file", "src": ruta_pdf}]}
            req["description"] = "En la pestaña Body elige un PDF (o foto) de respaldo; se reutiliza en requisitos y documentos."
        elif body is not None:
            req["header"].append({"key": "Content-Type", "value": "application/json"})
            raw = re.sub(r'"__NUM:(\w+)__"', r"{{\1}}", json.dumps(body, ensure_ascii=False, indent=2))
            req["body"] = {"mode": "raw", "raw": raw, "options": {"raw": {"language": "json"}}}
        if auth == "no":
            req["auth"] = {"type": "noauth"}
        elif auth == "residente":
            req["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{tokenResidente}}", "type": "string"}]}
        elif auth and auth.startswith("tok:"):
            req["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{" + auth[4:] + "}}", "type": "string"}]}
        carpetas.setdefault(carpeta, []).append(
            {"name": nombre, "request": req, "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": tests}}]})
    return {
        "info": {"_postman_id": str(uuid.uuid4()), "name": "ST-OBRAS V2 · Fases 1 a 6 (base, habilitación, ejecución, bodega, planillas, reportes, costeo y bitácora)",
                 "description": "Ejecuta primero '1. Auth → Login'. Variables en la pestaña Variables de la colección. "
                                "Repetible: cada corrida crea su propia obra y usuarios.",
                 "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}]},
        "variable": [{"key": k, "value": v, "type": "string"} for k, v in VARIABLES.items()],
        "item": [{"name": c, "item": i} for c, i in carpetas.items()],
    }


if __name__ == "__main__":
    json.dump(construir(), open(ARCHIVO, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"generado {ARCHIVO} ({len(P)} peticiones)")
    if "--firma" in sys.argv:
        ruta = sys.argv[sys.argv.index("--firma") + 1]
        pdf = sys.argv[sys.argv.index("--pdf") + 1] if "--pdf" in sys.argv else ""
        json.dump(construir(ruta, pdf), open("newman.tmp.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("generado newman.tmp.json (con firma de prueba)")

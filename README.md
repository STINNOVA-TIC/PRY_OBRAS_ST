# ST-OBRAS V2 · Seguimiento de obras de señalización vial

Sistema de Industria ST-INNOVA S.A. para obras de señalización vial: habilitación, avances, bodega,
planillas y aprobaciones con firma. Reemplaza la app PHP (obras-st) con el mismo negocio y permisos
validados en el servidor. El frontend y la gestión de firmas siguen el modelo del Punto de Venta.

| Carpeta | Qué es |
|---|---|
| `db/init/` | `01_schema.sql` (esquema completo) y `02_seed.sql` (roles, permisos, catálogos reales, admin) |
| `api/` | API REST NestJS 12 + TypeORM (ESM) |
| `web/` | Frontend React + Vite + Tailwind (basado en el POS) |

## Levantar con Docker

```bash
docker compose up -d --build
```

| Servicio | URL |
|---|---|
| Web | http://localhost:8081 |
| API | http://localhost:3000/api (salud: `/api/health`) |
| PostgreSQL | `localhost:5435` |

Usuario inicial: **admin@stinnova.com** / **Cambiar123!** (pide cambiarla al entrar).

Los scripts de `db/init` solo corren con la base vacía. Para recrearla (borra los datos):
```bash
docker compose down -v
docker compose up -d --build
```

## Despliegue en el servidor (misma VM que el punto de venta)

Conviven sin chocar: el POS usa los puertos 80, 5000 y 5432/5433; ST-OBRAS publica **solo la web en el 8081**.
La base (5435) y la API (3000) quedan atadas a `127.0.0.1`, así que no se ven desde la red.

| Contenedor | Puerto en la VM | Visible en la red |
|---|---|---|
| obras_v2_web | 8081 | Sí → `http://IP_DEL_SERVIDOR:8081` |
| obras_v2_api | 127.0.0.1:3000 | No (la web le habla por la red interna) |
| obras_v2_db | 127.0.0.1:5435 | No |

**Primera instalación**

```bash
sudo mkdir -p /home/docker-ubuntu/ST-OBRAS_V2 && cd /home/docker-ubuntu/ST-OBRAS_V2
# copia aquí el proyecto (git clone o descomprimiendo el zip), sin node_modules ni .env
cp .env.example .env
openssl rand -hex 24   # úsalo como DB_PASSWORD
openssl rand -hex 48   # úsalo como JWT_SECRET
nano .env              # pega las dos claves; deja DB_PORT=5435, API_PORT=3000, WEB_PORT=8081
docker compose up -d --build
docker compose ps      # los 3 deben quedar Up (healthy)
docker compose logs api --tail 30
sudo ufw status        # si está activo: sudo ufw allow 8081/tcp
```

La base se crea vacía con el usuario inicial **admin@stinnova.com / Cambiar123!** (pide cambiarla al entrar).

**Actualizar después de cambios**: reemplaza el código (sin tocar `.env`) y ejecuta
`docker compose up -d --build api web`. Las migraciones se aplican solas al arrancar la API; la base y los
adjuntos viven en los volúmenes `pgdata` y `uploads`, que no se borran al reconstruir.
**Nunca uses `docker compose down -v`**: la `-v` borra la base y los archivos.

**Respaldos automáticos** con el contenedor `obras_v2_backup` (se levanta con `docker compose up -d`):

- Todas las noches (por defecto 23:30, `BACKUP_CRON` en `.env`) y cada vez que arranca, guarda `bd_<fecha>.dump`
  (toda la base: obras, usuarios, avances, bodega, planillas, bitácora…) y `adjuntos_<fecha>.tgz` (todas las firmas,
  PDF y fotos) en `BACKUP_DIR`. **No borra ningún respaldo**: se conservan todos.
- En el servidor pon en `.env` `BACKUP_DIR=/home/docker-ubuntu/backups/obras`, **fuera** de la carpeta del proyecto,
  para que no se pierda al volver a clonar.
- `respaldo.log` anota cada respaldo con su tamaño y el disco libre; escribe ERROR si algo falla y AVISO bajo 15 % de
  disco. Un respaldo fallido no deja archivos a medias ni toca los anteriores.
- **Desde el sistema**: *Administración → Respaldos* (administrador y propietario, permiso `respaldos.gestionar`) muestra
  el horario automático, el último respaldo y el espacio en disco. **Crear en servidor** guarda un respaldo en `BACKUP_DIR`;
  **Descargar directo** genera uno completo y lo baja al equipo como `respaldo_ST-OBRAS_<fecha>.tar` (sin guardarlo en el
  servidor). Las descargas usan enlaces de un solo uso que vencen en 2 minutos. Para restaurar uno descargado: extrae el
  .tar en `BACKUP_DIR` (`tar xf respaldo_ST-OBRAS_<fecha>.tar -C /home/docker-ubuntu/backups/obras`) y usa `restaurar.sh`.
- Desde el servidor: `sh scripts/respaldo.sh` · Ver el log: `docker exec obras_v2_backup tail /backups/respaldo.log`
- **Restaurar** (pide escribir SI y antes respalda el estado actual): `sh scripts/restaurar.sh` lista los respaldos;
  `sh scripts/restaurar.sh 2026-11-17_233000` restaura ese.
- Copia la carpeta de respaldos fuera del servidor con regularidad.

## Desarrollo local (sin Docker para api/web)

```bash
docker compose up -d db          # solo la base
cd api && npm install && npm run start:dev     # lee ../.env (DB_HOST=localhost, DB_PORT=5435)
cd web && npm install && npm run dev           # http://localhost:5173 (proxy /api → :3000)
```

Pruebas: `cd api && npm run test:e2e` (con la base levantada).
Postman: importar `api/postman/st-obras-v2.postman_collection.json` y ejecutar primero *Login*. Pide elegir una imagen de firma y un PDF en las
peticiones de subida (Body → form-data). Con Newman: `python generar.py --firma f.png --pdf d.pdf` y
`npx newman run newman.tmp.json`.

## Actualizar una base existente

No hace falta recrear la base: al arrancar, la API aplica sola las migraciones pendientes (tabla
`migraciones_aplicadas`) sin borrar datos. Solo reconstruye: `docker compose up -d --build`.

## Reglas clave

- **Permisos**: roles + permisos por módulo + excepciones por usuario (como el POS). La visibilidad de
  obras se da por **equipo de la obra** (miembros con función) o por el permiso `obras.ver_todas`.
- **Firmas (patrón POS)**: cada usuario registra su imagen de firma. Los documentos designan firmantes;
  solo el designado firma; al firmar se estampa imagen, nombre, cargo y fecha. Cambiar un firmante
  borra las firmas ya estampadas. Tabla única `firmas` (habilitación, planillas, transferencias).
- **Stock global segmentado**: bodega central + una bodega por obra (se crea sola). El stock solo
  cambia con `movimientos_inventario` (kardex inmutable, sin negativos; consumos solo en obra).
- **Habilitación**: la obra nace en `HABILITACION`. Con los 4 requisitos en OK y al menos un contratista
  con sus 7 documentos aprobados por SIG y vigentes, firman Administrador y Superintendente (cualquier
  orden); con ambas firmas pasa sola a `ACTIVA`. Cualquier cambio en requisitos o documentos reinicia las
  firmas. Ya activa, solo se renuevan documentos de contratistas.
- **Avances**: solo con la obra en ejecución; no se aceptan fechas futuras. Para corregir se anula con
  motivo (queda en el historial) y se registra de nuevo. Quien lo registró puede anular el suyo; los
  demás necesitan `avances.anular`. Un rubro con avances no se elimina (se deja en cantidad 0).
- **Bodega**: la central la opera quien tiene `bodega.central` (Administrador y Bodeguero por defecto);
  el resto solo ve las bodegas de sus obras y puede pedirle material a la central. Los consumos solo en
  obras en ejecución. El kardex no se edita: se revierte. En una transferencia cada paso lo firma una
  persona distinta (quien aprueba no despacha ni recibe; quien despacha no recibe), salvo que quien
  la solicitó (normalmente el residente) también puede recibirla. Bodega puede **rechazar por falta de
  stock** una transferencia aprobada (motivo obligatorio, no mueve stock). Al despachar y recibir, cada
  material lleva un check «Cumple», una observación y una foto o documento opcionales; si llega menos de
  lo despachado hay que explicarlo (por material o en la nota general).
- **Existencias de obra**: *Requerido* = cantidad contratada × material por unidad del rubro;
  *Avances* = cantidad ejecutada × material por unidad; *Por ingresar* = requerido − (entradas − salidas).
  Tocando el valor se ve el cálculo rubro por rubro (`GET /bodegas/:id/stock/:materialId/desglose`).
- **Archivos**: hasta 50 MB por archivo (firmas hasta 5 MB). Nginx ya permite 50 MB; si pones otro
  proxy delante, súbele el límite también.
- **Importar Excel** (.xlsx): primero se lee y se muestra una vista previa con errores; nada se guarda
  hasta confirmar. La fila de títulos puede estar debajo de un texto; los totales se ignoran; números
  como «12.689,33» se leen bien. Los rubros que ya existen en la obra (mismo código, o misma
  descripción y unidad) se omiten. Crear materiales nuevos requiere `config.editar`.
- **Documentos habilitantes**: agregar, desactivar o cambiar el vencimiento de uno reinicia las firmas
  de las obras que están en habilitación. (La colección de Postman asume los 7 documentos del seed.)
- **Planillas**: una serie al cliente (todos los avances, precio de contrato) y una por contratista (solo
  sus avances, precio de subcontrato que se recuerda). Cada planilla toma los avances de su período
  (desde = día siguiente al cierre de la anterior); la cantidad del período se puede corregir y quedan
  alertas si difiere de la app, del ejecutado al corte o del contrato. La primera acepta lo planillado
  fuera de la app. No se crea la siguiente mientras haya una en elaboración, observada o presentada.
  Firmas: al presentar firma quien la elaboró, revisa el Superintendente y aprueba el Administrador
  (si uno de ellos la elaboró, aprueba el otro). Observar borra las firmas. Una vez presentada, nadie
  registra ni anula avances con fecha dentro de su período. Solo se anula la última de la serie y nunca
  una pagada. El contratista aún no firma en la app: firma el impreso, que se adjunta escaneado.
- **Bitácora**: cada evento guarda quién, cuándo, módulo, IP y navegador, y en las ediciones los campos
  con su valor antes → después. Registra también ingresos (y fallidos), cambios de contraseña y firma,
  usuarios, roles, permisos, parámetros, exportaciones y el costeo. Se ve en *Administración › Bitácora*
  (filtros por obra, usuario, módulo, fechas y texto; Excel) y en la pestaña *Historial* de cada obra
  (permiso `bitacora.ver`). Quien no ve todas las obras solo ve los eventos de las suyas, y los del costeo
  solo quien tiene acceso al costeo. El propietario ve además los «cambios técnicos» de un registro.
- **Reportes**: por obra (pestaña *Reporte*): avance por rubro, consumo real de bodega vs. programado
  (avances × insumos) con las tolerancias de *Parámetros*, y rendimientos de *Catálogo › Rendimientos*.
  El reporte general junta varias obras y se imprime/guarda como PDF.
- **Costeo privado**: permiso `costeo.ver` (editar: `costeo.editar`) y además un código personal de 4 a 8
  números; la sesión del costeo vence a los 30 min sin uso y se bloquea tras 5 intentos fallidos (se
  restablece con la contraseña de la cuenta).
- **Pedir documentos por enlace**: genera un enlace personal (sin cuenta) para un requisito de habilitación
  o los documentos de un contratista, con un máximo de subidas por documento (*Parámetros*). Lo subido queda
  pendiente de revisión, como si lo cargara el equipo.
- **Auditoría**: `bitacora` (eventos legibles por obra) y `auditoria_log` (cambios técnicos con usuario).

## Fases

1. **Base** ✅ seguridad, firmas de usuario, archivos, obras y equipo, catálogos, frontend base.
2. **Habilitación** ✅ 4 requisitos con archivo + confirmación + OK, contratistas con 7 documentos
   (versiones, vencimientos, revisión SIG), firmas del Administrador y Superintendente (con reemplazo),
   bandeja de firmas pendientes y registro de contratistas.
3. **Rubros, avances y programa** ✅ rubros desde catálogo o manuales con insumos por unidad, clase y
   ancho de línea; avances con abscisas (cálculo automático, segmentada = longitud / 4), tramo, color,
   contratista y fotos; anulación con motivo (no se borra); programa con ritmo real vs. mínimo diario,
   fin estimado, alertas, Gantt y necesidad de producto por semana.
4. **Bodega** ✅ bodega central + una por obra; ingresos con guía, consumos por rubro, salidas y ajustes;
   kardex inmutable con reverso; transferencias con 4 firmas (solicita → aprueba el Administrador de la
   obra → despacha la bodega de origen → recibe la de destino) y despacho/recepción parciales con nota;
   control de consumo real vs. avances × insumos; el programa usa el stock real.
   **Catálogo y Excel** ✅ página Catálogo (documentos habilitantes, rubros de referencia y materiales,
   con crear/editar/desactivar); importar rubros de la obra desde el presupuesto en Excel (DESCRIPCIÓN,
   UNIDAD, CANTIDAD, P. UNIT) y exportarlos; importar un ingreso a bodega desde Excel (CODIGO,
   DESCRIPCIÓN, UNIDAD, CANTIDAD), creando los materiales que falten.
5. **Planillas** ✅ al cliente y a contratistas: propuesta del período desde los avances, borrador
   editable (cantidades, precio de subcontrato, descuentos, datos y firmas del impreso), alertas por
   línea, flujo de firmas (elaborado → revisado → aprobado) con bandeja, observar/reabrir, pagada con
   referencia, anular, planilla firmada escaneada, Excel e impresión A4 horizontal (PDF desde el
   navegador) con anexo de memoria de cálculo; indicadores de lo ejecutado sin planillar por ejecutor.
6. **Reportes, costeo, bitácora y accesos externos** ✅ reporte por obra y general (PDF), rendimientos
   configurables, parámetros (tolerancias, IVA, empresa, apoderado), costeo privado con código, bitácora
   detallada con historial por obra y auditoría técnica, enlaces de carga para externos y tablero tipo
   CRM (ejecutado vs. planillado, facturado vs. cobrado, avance vs. tiempo, embudo de cobro, consumo).
   Pendiente: migración de datos desde la app PHP.

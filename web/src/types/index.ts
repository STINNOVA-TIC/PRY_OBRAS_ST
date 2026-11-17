// Tipos compartidos con la API de ST-OBRAS

export type Permiso = string; // ej. 'obras.crear' (catálogo completo en GET /api/permisos)

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  tieneFirma: boolean;
  contratistaId: string | null;
  requiereCambioPassword: boolean;
  roles: string[];
  permisos: Permiso[];
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  usuario: UsuarioSesion;
}

export interface Rol {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  esExterno: boolean;
  activo: boolean;
  permisos: PermisoItem[];
}

export interface PermisoItem {
  id: number;
  moduloId: number;
  codigo: string;
  accion: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Modulo {
  id: number;
  codigo: string;
  nombre: string;
  icono: string | null;
  orden: number;
  activo: boolean;
  permisos: PermisoItem[];
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  cedula: string | null;
  cargo: string | null;
  telefono: string | null;
  firmaArchivoId: string | null;
  contratistaId: string | null;
  requiereCambioPassword: boolean;
  activo: boolean;
  ultimoLogin: string | null;
  createdAt: string;
  updatedAt: string;
  desactivadoEn: string | null;
  roles: Rol[];
  passwordTemporal?: string;
}

export interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export type EstadoObra = 'HABILITACION' | 'ACTIVA' | 'PAUSADA' | 'CERRADA';
export type FuncionObra = 'ADMINISTRADOR' | 'SUPERINTENDENTE' | 'RESIDENTE' | 'BODEGUERO' | 'VISUALIZADOR';

export interface MiembroObra {
  usuarioId: string;
  nombre: string;
  email: string;
  cargo: string | null;
  funcion: FuncionObra;
  tieneFirma: boolean;
  activo: boolean;
  asignadoEn: string;
}

export interface Obra {
  id: string;
  codigo: string | null;
  nombre: string;
  cliente: string | null;
  ubicacion: string | null;
  provincia: string | null;
  descripcion: string | null;
  plazoTexto: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  estado: EstadoObra;
  administradorId: string | null;
  administradorNombre: string | null;
  superintendenteId: string | null;
  superintendenteNombre: string | null;
  habilitadaEn: string | null;
  diasLaborablesSemana: number;
  ventanaRitmoDias: number;
  createdAt: string;
  updatedAt: string;
  bodegaId: number;
  totalMiembros: number;
  miFuncion: FuncionObra | null;
  montoContrato: number;
  montoEjecutado: number;
  miembros?: MiembroObra[];
}

export interface Catalogos {
  materiales: { id: number; codigo: string; nombre: string; unidad: string; costoUnitario: number; stockMinimo: number; activo: boolean }[];
  rubros: { id: number; codigo: string | null; descripcion: string; unidad: string; puRef: number; clase: string | null; activo: boolean; insumos: { materialId: number; cantidadPorUnidad: number }[] }[];
  rendimientos: { id: number; codigo: string; nombre: string; tipo: string; clase: string | null; unidad: string }[];
  tiposRequisito: { id: number; codigo: string; nombre: string; textoConfirmacion: string; etiquetaRef: string; etiquetaFecha: string; etiquetaAdjunto: string; esMonto: boolean; orden: number }[];
  tiposDocumento: { id: number; codigo: string; nombre: string; vence: boolean; orden: number }[];
  parametros: { clave: string; valor: string; descripcion: string | null }[];
  bodegas: { id: number; codigo: string; nombre: string; tipo: 'CENTRAL' | 'OBRA'; obraId: string | null }[];
}

export const ESTADO_OBRA: Record<EstadoObra, { label: string; clase: string }> = {
  HABILITACION: { label: 'En habilitación', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  ACTIVA: { label: 'En ejecución', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PAUSADA: { label: 'Suspendida', clase: 'bg-orange-50 text-orange-700 border-orange-200' },
  CERRADA: { label: 'Cerrada', clase: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export const FUNCION_OBRA: Record<FuncionObra, string> = {
  ADMINISTRADOR: 'Administrador',
  SUPERINTENDENTE: 'Superintendente',
  RESIDENTE: 'Residente',
  BODEGUERO: 'Bodeguero',
  VISUALIZADOR: 'Visualizador',
};

// ---------------------------------------------------------------- Fase 2: habilitación
export type EstadoRequisito = 'PENDIENTE' | 'FALTA_ARCHIVO' | 'FALTA_OK' | 'OK';
export type EstadoDocumento = 'SIN_ARCHIVO' | 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'VENCIDO';

export interface RequisitoHab {
  tipoId: number;
  codigo: string;
  nombre: string;
  textoConfirmacion: string;
  etiquetaRef: string;
  etiquetaFecha: string;
  etiquetaAdjunto: string;
  esMonto: boolean;
  id: string | null;
  referencia: string | null;
  fecha: string | null;
  monto: number | null;
  archivoId: string | null;
  archivoNombre: string | null;
  confirmado: boolean;
  cargadoEn: string | null;
  cargadoPor: string | null;
  revisadoEn: string | null;
  revisadoPor: string | null;
  estado: EstadoRequisito;
}

export interface DocumentoContratista {
  tipoId: number;
  codigo: string;
  nombre: string;
  requiereVence: boolean;
  estado: EstadoDocumento;
  vigente: boolean;
  documento: null | {
    id: string;
    version: number;
    archivoId: string;
    archivoNombre: string;
    vence: string | null;
    estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
    observacion: string | null;
    cargadoEn: string;
    cargadoPor: string | null;
    revisadoEn: string | null;
    revisadoPor: string | null;
  };
}

export interface ContratistaObra {
  id: string; // obra_contratista
  contratistaId: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  objeto: string | null;
  documentos: DocumentoContratista[];
  completo: boolean;
}

export interface FirmaDetalle {
  id: string;
  rol: string;
  etiqueta: string;
  orden: number;
  designadoId: string | null;
  designadoNombre: string | null;
  designadoTieneFirma: boolean;
  firmado: boolean;
  firmadoPor: string | null;
  firmaArchivoId: string | null;
  nombreFirmante: string | null;
  cargoFirmante: string | null;
  firmadoEn: string | null;
  esReemplazo: boolean;
  motivo: string | null;
}

export interface Habilitacion {
  obra: { id: string; nombre: string; estado: EstadoObra; administradorId: string | null; superintendenteId: string | null; habilitadaEn: string | null };
  requisitos: RequisitoHab[];
  contratistas: ContratistaObra[];
  firmas: FirmaDetalle[];
  progreso: { items: { clave: string; nombre: string; ok: boolean }[]; hechos: number; total: number; completo: boolean };
}

export interface Contratista {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  createdAt: string;
  totalObras: number;
}

export interface FirmaPendienteHab {
  tipo: 'HABILITACION';
  obraId: string;
  obraNombre: string;
  rol: string;
  etiqueta: string;
  listo: boolean;
  progreso: string;
}
export interface FirmaPendienteTransf {
  tipo: 'TRANSFERENCIA';
  transferenciaId: string;
  numero: number;
  accion: 'APROBAR' | 'DESPACHAR' | 'RECIBIR';
  etiqueta: string;
  origen: string;
  destino: string;
  obraId: string | null;
  materiales: string;
}
export type FirmaPendiente = FirmaPendienteHab | FirmaPendienteTransf | FirmaPendientePlanilla;

// ---------------------------------------------------------------- Fase 3: rubros, avances, programa
export type ClaseRubro = 'TERMO' | 'TACHAS' | 'NINGUNA';
export interface InsumoRubro { materialId: number; codigo: string; nombre: string; unidad: string; cantidadPorUnidad: number }
export interface Rubro {
  id: string;
  catalogoRubroId: number | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  clase: ClaseRubro | null;
  claseEfectiva: 'TERMO' | 'TACHAS' | null;
  anchoCm: number | null;
  anchoEfectivo: number;
  orden: number;
  progInicio: string | null;
  progFin: string | null;
  progRendDia: number | null;
  ejecutado: number;
  totalAvances: number;
  avance: number;
  excede: boolean;
  saldo: number;
  montoContrato: number;
  montoEjecutado: number;
  insumos: InsumoRubro[];
}
export interface RubrosObra {
  estado: EstadoObra;
  rubros: Rubro[];
  totales: { montoContrato: number; montoEjecutado: number; avance: number; saldo: number };
}
export interface RubroInput {
  codigo?: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  clase?: ClaseRubro | null;
  anchoCm?: number | null;
  insumos?: { materialId: number; cantidadPorUnidad: number }[];
}
export interface Avance {
  id: string;
  obraRubroId: string;
  rubroCodigo: string | null;
  rubroDescripcion: string;
  unidad: string;
  fecha: string;
  cantidad: number;
  monto: number;
  obraContratistaId: string | null;
  contratistaNombre: string | null;
  frente: string | null;
  tramo: string | null;
  abscisaDesde: string | null;
  abscisaHasta: string | null;
  color: string | null;
  tipoLinea: string | null;
  numLineas: number | null;
  nota: string | null;
  registradoPorId: string;
  registradoPor: string;
  creadoEn: string;
  anuladoEn: string | null;
  anuladoPor: string | null;
  motivoAnulacion: string | null;
  evidencias: { id: string; nombre: string; mime: string }[];
}
export interface AvanceInput {
  obraRubroId: string;
  fecha: string;
  cantidad: number;
  obraContratistaId?: string | null;
  frente?: string | null;
  tramo?: string | null;
  abscisaDesde?: string | null;
  abscisaHasta?: string | null;
  color?: string | null;
  tipoLinea?: string | null;
  numLineas?: number | null;
  nota?: string | null;
  evidencias?: string[];
}
export interface PaginaAvances { data: Avance[]; total: number; page: number; limit: number; sumas: { cantidad: number; monto: number } }
export interface ResultadoAvance { avance: Avance; rubro: { cantidad: number; ejecutado: number; saldo: number; excede: boolean } }
export type NivelAlerta = 'CRITICO' | 'ATENCION' | 'PENDIENTE';
export interface AlertaPrograma { nivel: NivelAlerta; texto: string; rubroId?: string; materialId?: number; nombre: string }
export interface FilaPrograma {
  obraRubroId: string;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  ejecutado: number;
  avance: number;
  inicio: string;
  fin: string;
  inicioPropio: string | null;
  finPropio: string | null;
  rendPlanificado: number | null;
  rendReal: number;
  saldo: number;
  diasHabilesRestantes: number;
  minimoDia: number | null;
  vencido: boolean;
  finEstimado: string | null;
  esperado: number;
  atraso: number;
  alertas: { nivel: NivelAlerta; texto: string }[];
}
export interface MaterialPrograma {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  necesario: number;
  stock: number;
  faltante: number;
  consumoDia: number;
  minimo: number;
  minimoFijo: number | null;
  seAgota: string | null;
  pedirHasta: string | null;
  alertas: { nivel: NivelAlerta; texto: string }[];
}
export interface Programa {
  hoy: string;
  config: { fechaInicio: string | null; fechaFin: string | null; diasLaborablesSemana: number; ventanaRitmoDias: number; diasCobertura: number; diasEntrega: number };
  rango: { desde: string; hasta: string };
  rubros: FilaPrograma[];
  materiales: MaterialPrograma[];
  semanas: { desde: string; cantidades: Record<string, number> }[];
  alertas: AlertaPrograma[];
}
export interface ProgramaInput {
  diasLaborablesSemana?: number;
  ventanaRitmoDias?: number;
  diasCobertura?: number;
  diasEntrega?: number;
  rubros?: { obraRubroId: string; inicio: string | null; fin: string | null; rendDia: number | null }[];
  stockMinimo?: { materialId: number; cantidad: number | null }[];
}

// ---------------------------------------------------------------- Fase 4: bodega
export type TipoMovimiento = 'INGRESO' | 'CONSUMO' | 'DEVOLUCION' | 'AJUSTE' | 'TRANSFERENCIA_SALIDA' | 'TRANSFERENCIA_ENTRADA';
export interface Bodega {
  id: number;
  codigo: string;
  nombre: string;
  tipo: 'CENTRAL' | 'OBRA';
  obraId: string | null;
  obraNombre: string | null;
  obraEstado: EstadoObra | null;
  materialesConStock?: number | null;
  valorStock?: number | null;
  transferenciasAbiertas?: number | null;
  acceso?: boolean;
}
export type NivelControl = 'OK' | 'ATENCION' | 'CRITICO';
export interface MaterialStock {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  stock: number;
  entradas: number;
  salidas: number;
  consumido: number;
  valor: number;
  ultimoMovimiento: string | null;
  // central
  stockMinimo?: number;
  bajoMinimo?: boolean;
  // obra
  requerido?: number;
  pendienteIngresar?: number;
  consumoTeorico?: number;
  control?: { nivel: NivelControl; texto: string; desviacion: number | null } | null;
}
export interface StockBodega { bodega: Bodega; materiales: MaterialStock[]; umbrales: { atencion: number; critico: number } }
export interface DesgloseMaterial {
  material: { id: number; codigo: string; nombre: string; unidad: string };
  rubros: { rubroId: string; codigo: string | null; descripcion: string; unidad: string; porUnidad: number; contratado: number; ejecutado: number; avances: number; requerido: number; teorico: number }[];
  totales: { requerido: number; teorico: number; consumido: number };
}
export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  materialId: number;
  materialNombre: string;
  unidad: string;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  costoUnitario: number | null;
  fecha: string;
  documentoRef: string | null;
  archivoId: string | null;
  archivoNombre: string | null;
  obraRubroId: string | null;
  rubroDescripcion: string | null;
  transferenciaId: string | null;
  transferenciaNumero: number | null;
  revierteA: string | null;
  revertidoPor: string | null;
  nota: string | null;
  usuarioId: string;
  usuarioNombre: string;
  creadoEn: string;
}
export interface PaginaMovimientos { data: Movimiento[]; total: number; page: number; limit: number }
export interface MovimientoInput {
  tipo: 'INGRESO' | 'CONSUMO' | 'DEVOLUCION' | 'AJUSTE';
  materialId: number;
  cantidad: number;
  fecha: string;
  documentoRef?: string | null;
  archivoId?: string | null;
  costoUnitario?: number | null;
  obraRubroId?: string | null;
  nota?: string | null;
}
export type EstadoTransferencia = 'SOLICITADA' | 'APROBADA' | 'DESPACHADA' | 'RECIBIDA' | 'ANULADA' | 'RECHAZADA';
export interface TransferenciaResumen {
  id: string;
  numero: number;
  estado: EstadoTransferencia;
  motivo: string | null;
  creadoEn: string;
  actualizadoEn: string;
  bodegaOrigenId: number;
  origenNombre: string;
  bodegaDestinoId: number;
  destinoNombre: string;
  creadoPorNombre: string;
  items: number;
  materiales: string;
  siguientePaso: string | null;
}
export interface ItemTransferencia {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  solicitada: number;
  despachada: number | null;
  recibida: number | null;
  stockOrigen: number;
  notaDespacho: string | null;
  archivoDespachoId: string | null;
  archivoDespachoNombre: string | null;
  notaRecepcion: string | null;
  archivoRecepcionId: string | null;
  archivoRecepcionNombre: string | null;
}
export interface ItemMovTransferencia { materialId: number; cantidad: number; nota?: string | null; archivoId?: string | null }
export interface Transferencia {
  id: string;
  numero: number;
  estado: EstadoTransferencia;
  motivo: string | null;
  documentoRef: string | null;
  notaRecepcion: string | null;
  creadoEn: string;
  creadoPor: string;
  creadoPorNombre: string;
  anuladoEn: string | null;
  anuladoPorNombre: string | null;
  motivoAnulacion: string | null;
  rechazadoEn: string | null;
  rechazadoPorNombre: string | null;
  motivoRechazo: string | null;
  origen: Bodega & { acceso: boolean };
  destino: Bodega & { acceso: boolean };
  items: ItemTransferencia[];
  firmas: FirmaDetalle[];
  puede: { aprobar: boolean; despachar: boolean; rechazar: boolean; recibir: boolean; anular: boolean };
}
export interface Disponible { materialId: number; codigo: string; nombre: string; unidad: string; stock: number }

// ---------------------------------------------------------------- Catálogo e importación
export interface FilaRubroExcel {
  fila: number;
  codigo: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number | null;
  precioUnitario: number | null;
  errores: string[];
  yaExiste?: boolean;
}
export interface FilaMaterialExcel {
  fila: number;
  codigo: string | null;
  nombre: string | null;
  unidad: string | null;
  cantidad: number | null;
  costoUnitario: number | null;
  stockMinimo: number | null;
  errores: string[];
  materialId?: number | null;
  nuevo?: boolean;
  nombreCatalogo?: string | null;
}
export interface MaterialCat { id: number; codigo: string; nombre: string; unidad: string; costoUnitario: number; stockMinimo: number; activo: boolean; usos: number; stockTotal: number }
export interface RubroCat {
  id: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  puRef: number;
  clase: 'TERMO' | 'TACHAS' | null;
  activo: boolean;
  usos: number;
  insumos: { materialId: number; codigo: string; nombre: string; unidad: string; cantidadPorUnidad: number }[];
}
export interface DocumentoHab { id: number; codigo: string; nombre: string; vence: boolean; orden: number; activo: boolean; usos: number }

// ---------------------------------------------------------------- Fase 5: planillas
export type TipoPlanilla = 'CLIENTE' | 'CONTRATISTA';
export type EstadoPlanilla = 'BORRADOR' | 'PRESENTADA' | 'OBSERVADA' | 'APROBADA' | 'PAGADA' | 'ANULADA';
export interface PlanillaResumen {
  id: string;
  obraId: string;
  tipo: TipoPlanilla;
  obraContratistaId: string | null;
  contratistaNombre: string | null;
  numero: number;
  periodoDesde: string;
  periodoHasta: string;
  estado: EstadoPlanilla;
  subtotal: number;
  multa: number;
  base: number;
  iva: number;
  total: number;
  alertas: number;
  creadoPor: string;
  creadoPorNombre: string;
  creadoEn: string;
  actualizadoEn: string;
  tieneArchivo: boolean;
  siguientePaso: string | null;
}
export interface AlertaLinea { codigo: 'DIFIERE_APP' | 'CORTE' | 'EXCEDE' | 'SIN_PRECIO'; texto: string }
export interface LineaPlanilla {
  obraRubroId: string;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidadContrato: number;
  precioUnitario: number;
  cantidadAnterior: number;
  cantidadPeriodo: number;
  cantidadApp: number;
  cantidadAcumulada: number;
  subtotal: number;
  valorAnterior: number;
  valorAcumulado: number;
  pctEjecucion: number | null;
  corte: number | null;
  alertas: AlertaLinea[];
}
export interface FirmaFormato { nombre: string; cargo: string; entidad: string }
export interface FormatoPlanilla {
  proyecto?: string;
  provincia?: string;
  plazo?: string;
  contratante?: string;
  contratista?: string;
  fiscalizacion?: string;
  descripcion?: string;
  ampliacion?: string;
  anexo?: boolean;
  firmas?: FirmaFormato[];
}
export interface TotalesPlanilla { montoContrato: number; subtotal: number; multa: number; base: number; iva: number; total: number; anterior: number; acumulado: number }
export interface AvanceAnexo {
  fecha: string; rubro: string; unidad: string; cantidad: number; abscisaDesde: string | null; abscisaHasta: string | null;
  frente: string | null; tramo: string | null; nota: string | null; registradoPorNombre: string; ejecutor: string;
}
export interface Planilla extends PlanillaResumen {
  multaDetalle: string | null;
  observacion: string | null;
  formato: FormatoPlanilla;
  ivaPct: number;
  archivoId: string | null;
  archivoNombre: string | null;
  pagadaFecha: string | null;
  pagoRef: string | null;
  motivoAnulacion: string | null;
  estadoEn: string | null;
  estadoPorNombre: string | null;
  obraNombre: string;
  obraCodigo: string | null;
  obraCliente: string | null;
  obraInicio: string | null;
  obraFin: string | null;
  primera: boolean;
  lineas: LineaPlanilla[];
  totales: TotalesPlanilla;
  firmas: FirmaDetalle[];
  anexo: AvanceAnexo[];
  puede: { editar: boolean; eliminar: boolean; presentar: boolean; firmar: boolean; observar: boolean; pagar: boolean; anular: boolean; adjuntar: boolean };
}
export interface PropuestaPlanilla {
  numero: number;
  desde: string;
  hasta: string;
  primera: boolean;
  bloqueo: string | null;
  lineas: LineaPlanilla[];
  formato: FormatoPlanilla;
}
export interface RubroContratistaPl { obraRubroId: string; descripcion: string; unidad: string; ejecutado: number; planillado: number; porPlanillar: number; precioUnitario: number | null }
export interface ResumenPlanillas {
  obraEstado: EstadoObra;
  cliente: {
    montoContrato: number; ejecutado: number; sinPlanillar: number; planillado: number; aprobado: number; pagado: number;
    porEjecutor: { obraContratistaId: string | null; ejecutor: string; valor: number }[];
  };
  contratistas: {
    obraContratistaId: string; nombre: string; activo: boolean; n: number; presentado: number; aprobado: number; pagado: number;
    porPlanillarValor: number; rubros: RubroContratistaPl[];
  }[];
  planillas: PlanillaResumen[];
  puede: { elaborar: boolean };
}
export interface FirmaPendientePlanilla {
  tipo: 'PLANILLA';
  planillaId: string;
  obraId: string;
  obraNombre: string;
  numero: number;
  tipoPlanilla: TipoPlanilla;
  contratistaNombre: string | null;
  rol: string;
  etiqueta: string;
  periodoDesde: string;
  periodoHasta: string;
  total: number;
}
export interface LineaPlanillaInput { obraRubroId: string; cantidadPeriodo?: number; precioUnitario?: number; cantidadAnterior?: number }
export interface PlanillaInput {
  periodoDesde?: string;
  periodoHasta?: string;
  multa?: number;
  multaDetalle?: string | null;
  observacion?: string | null;
  formato?: FormatoPlanilla;
  lineas?: LineaPlanillaInput[];
}

// ---------------------------------------------------------------- Fase 6: bitácora, reportes, costeo, accesos
export interface CambioBitacora { campo: string; antes: unknown; despues: unknown }
export interface EventoBitacora {
  id: string; fecha: string; obraId: string | null; obraNombre: string | null; modulo: string; accion: string; detalle: string | null;
  cambios: CambioBitacora[]; usuarioId: string | null; usuarioNombre: string | null; usuarioEmail: string | null;
  entidad: string | null; entidadId: string | null; ip: string | null; agente: string | null;
}
export interface FiltroBitacora { obraId?: string; usuarioId?: string; modulo?: string; desde?: string; hasta?: string; q?: string; pagina?: number; limite?: number }
export interface RegistroAuditoria {
  id: string; fecha: string; operacion: 'INSERT' | 'UPDATE' | 'DELETE'; usuarioNombre: string | null;
  cambios: CambioBitacora[]; datosAntes: Record<string, unknown> | null; datosDespues: Record<string, unknown> | null;
}
export interface Parametro { clave: string; etiqueta: string; tipo: 'pct' | 'texto' | 'entero'; valor: string; descripcion: string | null }
export interface Rendimiento {
  id: number; codigo: string; nombre: string; tipo: 'REND' | 'DOSIS'; clase: 'TERMO' | 'TACHAS' | null; unidad: string; factor: number;
  unidadBase: string | null; factorBase: number | null; minimo: number | null; bueno: number | null; ideal: number | null; maximo: number | null;
  activo: boolean; materiales: number[]; base: number[];
}
export type NivelEval = 'ok' | 'alerta' | 'fuera' | 'nd';
export interface Evaluacion { k: NivelEval; t: string; v?: number | null }
export interface RendimientoObra {
  id: number; codigo: string; nombre: string; tipo: 'REND' | 'DOSIS'; unidadN: string; unidadD: string; materiales: string; base: string;
  minimo: number | null; bueno: number | null; ideal: number | null; maximo: number | null; N: number; D: number; valor: number | null;
  evaluacion: Evaluacion; dias: { fecha: string; n: number; d: number; v: number | null; evaluacion: Evaluacion | null }[];
}
export interface ReporteObra {
  obra?: { nombre: string; estado: EstadoObra; cliente: string | null };
  periodo: { desde: string | null; hasta: string | null };
  umbrales: { t1: number; t2: number };
  totales: { contratado: number; montoPeriodo: number; montoAcumulado: number; pct: number };
  rubros: { id: string; codigo: string | null; descripcion: string; unidad: string; cantidad: number; pu: number; periodo: number; montoPeriodo: number; acumulado: number; montoAcumulado: number; pct: number | null }[];
  materiales: { materialId: number; codigo: string; nombre: string; unidad: string; programado: number; real: number; diferencia: number; valorDiferencia: number; evaluacion: Evaluacion }[];
  detalle: { obraRubroId: string; rubro: string; materialId: number; material: string; unidad: string; programado: number; real: number; evaluacion: Evaluacion }[];
  sinRubro: number;
  rendimientos: RendimientoObra[];
}
export interface ReporteGeneral {
  periodo: { desde: string | null; hasta: string | null };
  visibles: { id: string; nombre: string; estado: EstadoObra }[];
  totales: { contratado: number; ejecutado: number; periodo: number; pct: number; alertas: number };
  obras: {
    obra: { id: string; nombre: string; cliente: string | null; estado: EstadoObra; codigo: string | null };
    totales: ReporteObra['totales']; rubros: ReporteObra['rubros']; materiales: ReporteObra['materiales']; rendimientos: RendimientoObra[]; alertas: number;
  }[];
  habilitacion: { id: string; nombre: string; cliente: string | null; total: number; hechos: number; contratistas: number; firmas: number }[];
}
export interface CosteoRubro {
  id: string; codigo: string | null; descripcion: string; unidad: string; cantidad: number; pu: number; ejecutado: number;
  mat: number | null; matAuto: number; mo: number; eq: number; sub: number; otr: number; conCosto: boolean;
  directo: number; costoUnit: number; margenUnit: number; margenPct: number | null;
  ventaContrato: number; costoContrato: number; ventaEjecutada: number; costoEjecutado: number;
}
export interface CosteoObra {
  obra: { id: string; nombre: string; cliente: string | null; estado: EstadoObra };
  rubros: CosteoRubro[];
  indirectos: { id: string | null; descripcion: string; tipo: 'PCT' | 'MONTO'; valor: number; usd: number }[];
  indirectosSugeridos: boolean;
  materiales: { id: number; codigo: string; nombre: string; unidad: string; costoCatalogo: number; costoObra: number | null; costo: number; consumo: number; valor: number }[];
  totales: {
    directoContrato: number; totalIndirectos: number; factorIndirectos: number; ventaContrato: number; costoContrato: number; utilidadContrato: number;
    margenContrato: number; ventaEjecutada: number; costoEjecutado: number; materialReal: number; costoReal: number; utilidadReal: number; margenReal: number;
  };
}
export interface AccesoExterno {
  id: string; tipo: 'DOCUMENTO' | 'CONTRATISTA'; nombre: string; email: string; codigo: string; token: string; estado: 'ABIERTO' | 'CERRADO' | 'CANCELADO';
  maxIntentos: number; creadoEn: string; cerradoEn: string | null; creadoPorNombre: string; requisitoNombre: string | null; contratistaNombre: string | null;
  usos: number; maxUsos: number | null;
}
export interface CargaPublica {
  obra: string; cliente: string | null; nombre: string; pedidoPor: string; tipo: 'DOCUMENTO' | 'CONTRATISTA'; estado: string; abierto: boolean;
  motivoCierre: string | null; maxSubidas: number; contratista?: string;
  documentos: { codigo: string; nombre: string; adjunto?: string | null; vence: boolean; usadas: number; quedan: number;
    actual: { archivo: string; cargadoEn: string; estado: string | null; observacion?: string | null; vence?: string | null } | null }[];
}

// ---------------------------------------------------------------- Tablero
export interface DatosDashboard {
  estados: { estado: EstadoObra; n: number }[];
  kpis: { contratado: number; ejecutado: number; pct: number; ejecutadoMes: number; ejecutadoMesAnterior: number; porCobrar: number | null; cobrado: number | null };
  mensual: { mes: string; ejecutado: number; planillado: number }[];
  avance: { id: string; nombre: string; contratado: number; ejecutado: number; pct: number; pctTiempo: number | null }[];
  atrasadas: number;
  cobro: { etapa: 'ELABORACION' | 'PRESENTADA' | 'APROBADA' | 'PAGADA'; n: number; total: number }[] | null;
  facturacion: {
    mensual: { mes: string; facturado: number; cobrado: number }[];
    porObra: { id: string; nombre: string; facturado: number; cobrado: number }[];
    totales: { facturado: number; cobrado: number; pendiente: number };
  } | null;
  consumo: { id: number; nombre: string; unidad: string; cantidad: number; valor: number }[] | null;
  documentos: { vencidos: number; porVencer: number };
  ver: { planillas: boolean; bodega: boolean };
}

export interface ArchivoRespaldo { nombre: string; bytes: number }
export interface ResumenRespaldos {
  configurado: boolean;
  horario: { cron: string; texto: string; zona: string };
  estado: { enCurso: boolean; inicio?: string; usuario?: string; ultimo?: { fin: string; ok: boolean; mensaje: string; usuario: string } };
  respaldos: { fecha: string; momento: string; bd?: ArchivoRespaldo; adjuntos?: ArchivoRespaldo }[];
  total: number;
  tamanoTotal: number;
  log: string[];
  disco: { libreBytes: number; totalBytes: number; librePct: number } | null;
}

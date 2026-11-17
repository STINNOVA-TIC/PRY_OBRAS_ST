import { api, subirMultipart } from './client';
import type {
  Catalogos,
  Contratista,
  FirmaPendiente,
  Habilitacion,
  LoginResponse,
  Modulo,
  Obra,
  Pagina,
  Rol,
  Usuario,
  UsuarioSesion, Rubro, RubrosObra, RubroInput, PaginaAvances, ResultadoAvance, AvanceInput, Programa, ProgramaInput, Bodega, DesgloseMaterial,
  ResumenRespaldos,
  StockBodega, Disponible, PaginaMovimientos, Movimiento, MovimientoInput, TransferenciaResumen, Transferencia, MaterialCat, RubroCat, DocumentoHab, FilaRubroExcel, FilaMaterialExcel, ResumenPlanillas, PropuestaPlanilla, Planilla, PlanillaInput, TipoPlanilla, FiltroBitacora, EventoBitacora, RegistroAuditoria, Parametro, Rendimiento, ReporteObra, ReporteGeneral, CosteoObra, AccesoExterno, CargaPublica, EstadoObra, DatosDashboard, ItemMovTransferencia } from '../types';

export const authAPI = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get<UsuarioSesion>('/auth/me').then((r) => r.data),
  perfil: () => api.get<Usuario>('/auth/perfil').then((r) => r.data),
  cambiarPassword: (actual: string, nueva: string) =>
    api.patch('/auth/password', { actual, nueva }).then((r) => r.data),
  subirMiFirma: (archivo: File) => subirMultipart<UsuarioSesion>('/auth/firma', archivo, 'put').then((r) => r.data),
};

export interface FiltroUsuarios {
  q?: string;
  activo?: boolean;
  rolId?: number;
  page?: number;
  limit?: number;
}

export const usuariosAPI = {
  listar: (f: FiltroUsuarios = {}) => api.get<Pagina<Usuario>>('/usuarios', { params: f }).then((r) => r.data),
  obtener: (id: string) => api.get<Usuario>(`/usuarios/${id}`).then((r) => r.data),
  crear: (data: Partial<Usuario> & { password?: string; rolIds?: number[] }) =>
    api.post<Usuario>('/usuarios', data).then((r) => r.data),
  actualizar: (id: string, data: Record<string, unknown>) => api.patch<Usuario>(`/usuarios/${id}`, data).then((r) => r.data),
  activar: (id: string) => api.patch<Usuario>(`/usuarios/${id}/activar`).then((r) => r.data),
  desactivar: (id: string) => api.patch<Usuario>(`/usuarios/${id}/desactivar`).then((r) => r.data),
  resetPassword: (id: string, password?: string) =>
    api.post<{ mensaje: string; passwordTemporal?: string }>(`/usuarios/${id}/reset-password`, password ? { password } : {}).then((r) => r.data),
  asignarRoles: (id: string, rolIds: number[]) => api.put<Usuario>(`/usuarios/${id}/roles`, { rolIds }).then((r) => r.data),
  subirFirma: (id: string, archivo: File) => subirMultipart<Usuario>(`/usuarios/${id}/firma`, archivo, 'put').then((r) => r.data),
  quitarFirma: (id: string) => api.delete<Usuario>(`/usuarios/${id}/firma`).then((r) => r.data),
};

export const rolesAPI = {
  listar: (incluirInactivos = false) => api.get<Rol[]>('/roles', { params: { incluirInactivos } }).then((r) => r.data),
  catalogoPermisos: () => api.get<Modulo[]>('/permisos').then((r) => r.data),
  crear: (data: { codigo: string; nombre: string; descripcion?: string; permisoIds?: number[] }) =>
    api.post<Rol>('/roles', data).then((r) => r.data),
  actualizar: (id: number, data: { nombre?: string; descripcion?: string | null }) =>
    api.patch<Rol>(`/roles/${id}`, data).then((r) => r.data),
  asignarPermisos: (id: number, permisoIds: number[]) =>
    api.put<Rol>(`/roles/${id}/permisos`, { permisoIds }).then((r) => r.data),
  activar: (id: number) => api.patch<Rol>(`/roles/${id}/activar`).then((r) => r.data),
  desactivar: (id: number) => api.patch<Rol>(`/roles/${id}/desactivar`).then((r) => r.data),
};

export const obrasAPI = {
  listar: (f: { q?: string; estado?: string } = {}) => api.get<Obra[]>('/obras', { params: f }).then((r) => r.data),
  obtener: (id: string) => api.get<Obra>(`/obras/${id}`).then((r) => r.data),
  crear: (data: Partial<Obra>) => api.post<Obra>('/obras', data).then((r) => r.data),
  actualizar: (id: string, data: Partial<Obra>) => api.patch<Obra>(`/obras/${id}`, data).then((r) => r.data),
  eliminar: (id: string) => api.delete(`/obras/${id}`).then((r) => r.data),
  asignarMiembro: (id: string, usuarioId: string, funcion: string) =>
    api.put<Obra>(`/obras/${id}/miembros/${usuarioId}`, { funcion }).then((r) => r.data),
  quitarMiembro: (id: string, usuarioId: string) => api.delete<Obra>(`/obras/${id}/miembros/${usuarioId}`).then((r) => r.data),
  designarFirmantes: (id: string, data: { administradorId?: string | null; superintendenteId?: string | null }) =>
    api.patch<Obra>(`/obras/${id}/firmantes`, data).then((r) => r.data),
  cambiarEstado: (id: string, estado: string, motivo: string) =>
    api.patch<Obra>(`/obras/${id}/estado`, { estado, motivo }).then((r) => r.data),
};

export const catalogosAPI = {
  todos: () => api.get<Catalogos>('/catalogos').then((r) => r.data),
};

/** Archivos protegidos: subir (PDF/imagen) y descargar como Blob (para <img> y vista previa). */
export const archivosAPI = {
  subir: (archivo: File, categoria: 'DOCUMENTO' | 'EVIDENCIA' = 'DOCUMENTO') =>
    subirMultipart<{ id: string; nombreOriginal: string }>('/archivos', archivo, 'post', { categoria }).then((r) => r.data),
  blob: (id: string) => api.get<Blob>(`/archivos/${id}/contenido`, { responseType: 'blob' }).then((r) => r.data),
};

export const contratistasAPI = {
  listar: (q?: string) => api.get<Contratista[]>('/contratistas', { params: q ? { q } : {} }).then((r) => r.data),
  crear: (data: Partial<Contratista>) => api.post<Contratista>('/contratistas', data).then((r) => r.data),
  actualizar: (id: string, data: Partial<Contratista>) => api.patch<Contratista>(`/contratistas/${id}`, data).then((r) => r.data),
};

const hab = (obraId: string) => `/obras/${obraId}/habilitacion`;
export const habilitacionAPI = {
  obtener: (obraId: string) => api.get<Habilitacion>(hab(obraId)).then((r) => r.data),
  guardarRequisito: (obraId: string, codigo: string, data: { referencia?: string | null; fecha?: string | null; monto?: number | null; archivoId?: string | null; confirmado?: boolean }) =>
    api.put<Habilitacion>(`${hab(obraId)}/requisitos/${codigo}`, data).then((r) => r.data),
  revisarRequisito: (obraId: string, codigo: string, ok: boolean) =>
    api.post<Habilitacion>(`${hab(obraId)}/requisitos/${codigo}/revision`, { ok }).then((r) => r.data),
  agregarContratista: (obraId: string, contratistaId: string, objeto?: string) =>
    api.post<Habilitacion>(`${hab(obraId)}/contratistas`, { contratistaId, ...(objeto && { objeto }) }).then((r) => r.data),
  quitarContratista: (obraId: string, ocId: string) => api.delete<Habilitacion>(`${hab(obraId)}/contratistas/${ocId}`).then((r) => r.data),
  subirDocumento: (obraId: string, ocId: string, codigo: string, archivoId: string, vence?: string) =>
    api.put<Habilitacion>(`${hab(obraId)}/contratistas/${ocId}/documentos/${codigo}`, { archivoId, ...(vence && { vence }) }).then((r) => r.data),
  revisarDocumento: (obraId: string, documentoId: string, estado: 'APROBADO' | 'RECHAZADO', observacion?: string) =>
    api.post<Habilitacion>(`${hab(obraId)}/documentos/${documentoId}/revision`, { estado, ...(observacion && { observacion }) }).then((r) => r.data),
  firmar: (obraId: string) => api.post<Habilitacion>(`${hab(obraId)}/firmar`, {}).then((r) => r.data),
  firmarReemplazo: (obraId: string, motivo: string) => api.post<Habilitacion>(`${hab(obraId)}/firmar-reemplazo`, { motivo }).then((r) => r.data),
};

export const firmasAPI = {
  pendientes: () => api.get<FirmaPendiente[]>('/firmas/pendientes').then((r) => r.data),
};

// ---------------------------------------------------------------- Fase 3
export const rubrosAPI = {
  listar: (obraId: string) => api.get<RubrosObra>(`/obras/${obraId}/rubros`).then((r) => r.data),
  crear: (obraId: string, d: RubroInput) => api.post<Rubro>(`/obras/${obraId}/rubros`, d).then((r) => r.data),
  actualizar: (obraId: string, id: string, d: Partial<RubroInput>) => api.patch<Rubro>(`/obras/${obraId}/rubros/${id}`, d).then((r) => r.data),
  eliminar: (obraId: string, id: string) => api.delete(`/obras/${obraId}/rubros/${id}`).then((r) => r.data),
  desdeCatalogo: (obraId: string, items: { catalogoRubroId: number; cantidad: number; precioUnitario?: number }[]) =>
    api.post<{ agregados: number }>(`/obras/${obraId}/rubros/desde-catalogo`, { items }).then((r) => r.data),
  ordenar: (obraId: string, ids: string[]) => api.put<RubrosObra>(`/obras/${obraId}/rubros/orden`, { ids }).then((r) => r.data),
};

export const avancesAPI = {
  listar: (obraId: string, f: { rubroId?: string; contratista?: string; desde?: string; hasta?: string; incluirAnulados?: boolean; page?: number; limit?: number } = {}) =>
    api.get<PaginaAvances>(`/obras/${obraId}/avances`, { params: f }).then((r) => r.data),
  registrar: (obraId: string, d: AvanceInput) => api.post<ResultadoAvance>(`/obras/${obraId}/avances`, d).then((r) => r.data),
  anular: (obraId: string, id: string, motivo: string) => api.post<ResultadoAvance>(`/obras/${obraId}/avances/${id}/anular`, { motivo }).then((r) => r.data),
};

export const programaAPI = {
  obtener: (obraId: string) => api.get<Programa>(`/obras/${obraId}/programa`).then((r) => r.data),
  guardar: (obraId: string, d: ProgramaInput) => api.put<Programa>(`/obras/${obraId}/programa`, d).then((r) => r.data),
};

// ---------------------------------------------------------------- Fase 4: bodega
export const bodegasAPI = {
  listar: () => api.get<Bodega[]>('/bodegas').then((r) => r.data),
  stock: (id: number) => api.get<StockBodega>(`/bodegas/${id}/stock`).then((r) => r.data),
  desglose: (id: number, materialId: number) => api.get<DesgloseMaterial>(`/bodegas/${id}/stock/${materialId}/desglose`).then((r) => r.data),
  disponible: (id: number) => api.get<Disponible[]>(`/bodegas/${id}/disponible`).then((r) => r.data),
  movimientos: (id: number, f: { materialId?: number; tipo?: string; desde?: string; hasta?: string; page?: number; limit?: number } = {}) =>
    api.get<PaginaMovimientos>(`/bodegas/${id}/movimientos`, { params: f }).then((r) => r.data),
  registrar: (id: number, d: MovimientoInput) => api.post<Movimiento>(`/bodegas/${id}/movimientos`, d).then((r) => r.data),
  revertir: (id: number, movId: string, motivo: string) =>
    api.post<Movimiento>(`/bodegas/${id}/movimientos/${movId}/revertir`, { motivo }).then((r) => r.data),
};

export const transferenciasAPI = {
  listar: (f: { bodegaId?: number; estado?: string; limit?: number } = {}) =>
    api.get<TransferenciaResumen[]>('/transferencias', { params: f }).then((r) => r.data),
  obtener: (id: string) => api.get<Transferencia>(`/transferencias/${id}`).then((r) => r.data),
  solicitar: (d: { bodegaOrigenId: number; bodegaDestinoId: number; items: { materialId: number; cantidad: number }[]; motivo?: string | null }) =>
    api.post<Transferencia>('/transferencias', d).then((r) => r.data),
  aprobar: (id: string) => api.post<Transferencia>(`/transferencias/${id}/aprobar`).then((r) => r.data),
  despachar: (id: string, d: { items?: ItemMovTransferencia[]; documentoRef?: string | null }) =>
    api.post<Transferencia>(`/transferencias/${id}/despachar`, d).then((r) => r.data),
  recibir: (id: string, d: { items?: ItemMovTransferencia[]; nota?: string | null }) =>
    api.post<Transferencia>(`/transferencias/${id}/recibir`, d).then((r) => r.data),
  anular: (id: string, motivo: string) => api.post<Transferencia>(`/transferencias/${id}/anular`, { motivo }).then((r) => r.data),
  rechazar: (id: string, d: { motivo: string; items?: { materialId: number; nota?: string | null; archivoId?: string | null }[] }) =>
    api.post<Transferencia>(`/transferencias/${id}/rechazar`, d).then((r) => r.data),
};

// ---------------------------------------------------------------- Catálogo e importación Excel
/** Descarga un archivo de la API (Excel) y lo guarda con su nombre. */
export async function descargar(url: string, nombre: string) {
  const r = await api.get<Blob>(url, { responseType: 'blob' });
  const href = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export const respaldosAPI = {
  resumen: () => api.get<ResumenRespaldos>('/respaldos').then((r) => r.data),
  iniciar: () => api.post<ResumenRespaldos['estado']>('/respaldos').then((r) => r.data),
  /** Descarga por enlace de un solo uso: el navegador la maneja directo (con su barra de progreso), sin cargarla en memoria. */
  descargar: async (nombre?: string) => {
    const { url } = await api.post<{ url: string }>('/respaldos/enlace', nombre ? { nombre } : {}).then((r) => r.data);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};

export const catalogoAPI = {
  materiales: () => api.get<MaterialCat[]>('/catalogo/materiales').then((r) => r.data),
  crearMaterial: (d: { codigo: string; nombre: string; unidad: string; costoUnitario?: number; stockMinimo?: number }) =>
    api.post<{ id: number }>('/catalogo/materiales', d).then((r) => r.data),
  actualizarMaterial: (id: number, d: Partial<{ nombre: string; unidad: string; costoUnitario: number; stockMinimo: number; activo: boolean }>) =>
    api.patch(`/catalogo/materiales/${id}`, d).then((r) => r.data),
  leerMateriales: (f: File) => subirMultipart<{ filas: FilaMaterialExcel[] }>('/catalogo/materiales/importar/leer', f).then((r) => r.data.filas),
  importarMateriales: (filas: { codigo: string; nombre: string; unidad: string; costoUnitario?: number | null; stockMinimo?: number | null }[]) =>
    api.post<{ creados: number; actualizados: number }>('/catalogo/materiales/importar', { filas }).then((r) => r.data),

  rubros: () => api.get<RubroCat[]>('/catalogo/rubros').then((r) => r.data),
  crearRubro: (d: { codigo?: string | null; descripcion: string; unidad: string; puRef?: number; clase?: string | null; insumos?: { materialId: number; cantidadPorUnidad: number }[] }) =>
    api.post<{ id: number }>('/catalogo/rubros', d).then((r) => r.data),
  actualizarRubro: (id: number, d: Record<string, unknown>) => api.patch(`/catalogo/rubros/${id}`, d).then((r) => r.data),
  leerRubros: (f: File) => subirMultipart<{ filas: FilaRubroExcel[] }>('/catalogo/rubros/importar/leer', f).then((r) => r.data.filas),
  importarRubros: (filas: { codigo?: string | null; descripcion: string; unidad: string; precioUnitario?: number | null }[]) =>
    api.post<{ creados: number; actualizados: number }>('/catalogo/rubros/importar', { filas }).then((r) => r.data),

  documentos: () => api.get<DocumentoHab[]>('/catalogo/documentos').then((r) => r.data),
  crearDocumento: (d: { nombre: string; vence: boolean }) =>
    api.post<{ id: number; codigo: string; firmasReiniciadas: number }>('/catalogo/documentos', d).then((r) => r.data),
  actualizarDocumento: (id: number, d: Partial<{ nombre: string; vence: boolean; activo: boolean; orden: number }>) =>
    api.patch<{ id: number; firmasReiniciadas: number }>(`/catalogo/documentos/${id}`, d).then((r) => r.data),
};

export const importacionAPI = {
  leerRubrosObra: (obraId: string, f: File) =>
    subirMultipart<{ filas: FilaRubroExcel[] }>(`/obras/${obraId}/rubros/importar/leer`, f).then((r) => r.data.filas),
  importarRubrosObra: (obraId: string, filas: { codigo?: string | null; descripcion: string; unidad: string; cantidad: number; precioUnitario?: number | null }[]) =>
    api.post<{ creados: number; omitidos: string[] }>(`/obras/${obraId}/rubros/importar`, { filas }).then((r) => r.data),
  leerIngreso: (bodegaId: number, f: File) =>
    subirMultipart<{ filas: FilaMaterialExcel[] }>(`/bodegas/${bodegaId}/ingresos/importar/leer`, f).then((r) => r.data.filas),
  importarIngreso: (bodegaId: number, d: { filas: { codigo: string; nombre: string; unidad: string; cantidad: number; costoUnitario?: number | null }[]; fecha: string; documentoRef?: string | null; archivoId?: string | null }) =>
    api.post<{ ingresos: number; materialesNuevos: number }>(`/bodegas/${bodegaId}/ingresos/importar`, d).then((r) => r.data),
};

// ---------------------------------------------------------------- Fase 5: planillas
const pl = (obraId: string) => `/obras/${obraId}/planillas`;
export const planillasAPI = {
  resumen: (obraId: string) => api.get<ResumenPlanillas>(pl(obraId)).then((r) => r.data),
  propuesta: (obraId: string, tipo: TipoPlanilla, obraContratistaId?: string | null, periodoHasta?: string) =>
    api.get<PropuestaPlanilla>(`${pl(obraId)}/propuesta`, { params: { tipo, obraContratistaId: obraContratistaId || undefined, periodoHasta: periodoHasta || undefined } }).then((r) => r.data),
  obtener: (obraId: string, id: string) => api.get<Planilla>(`${pl(obraId)}/${id}`).then((r) => r.data),
  crear: (obraId: string, d: PlanillaInput & { tipo: TipoPlanilla; obraContratistaId?: string | null }) =>
    api.post<Planilla>(pl(obraId), { ...d, obraContratistaId: d.obraContratistaId || undefined }).then((r) => r.data),
  actualizar: (obraId: string, id: string, d: PlanillaInput) => api.patch<Planilla>(`${pl(obraId)}/${id}`, d).then((r) => r.data),
  eliminar: (obraId: string, id: string) => api.delete(`${pl(obraId)}/${id}`).then((r) => r.data),
  presentar: (obraId: string, id: string) => api.post<Planilla>(`${pl(obraId)}/${id}/presentar`).then((r) => r.data),
  firmar: (obraId: string, id: string) => api.post<Planilla>(`${pl(obraId)}/${id}/firmar`).then((r) => r.data),
  observar: (obraId: string, id: string, motivo: string) => api.post<Planilla>(`${pl(obraId)}/${id}/observar`, { motivo }).then((r) => r.data),
  pagar: (obraId: string, id: string, fecha: string, referencia?: string) =>
    api.post<Planilla>(`${pl(obraId)}/${id}/pagar`, { fecha, referencia: referencia || undefined }).then((r) => r.data),
  anular: (obraId: string, id: string, motivo: string) => api.post<Planilla>(`${pl(obraId)}/${id}/anular`, { motivo }).then((r) => r.data),
  adjuntar: (obraId: string, id: string, archivoId: string | null) => api.put<Planilla>(`${pl(obraId)}/${id}/archivo`, { archivoId }).then((r) => r.data),
  exportar: (obraId: string, id: string, nombre: string) => descargar(`${pl(obraId)}/${id}/exportar`, nombre),
};

// ---------------------------------------------------------------- Fase 6
export const bitacoraAPI = {
  listar: (f: FiltroBitacora) => api.get<{ datos: EventoBitacora[]; total: number; pagina: number; limite: number }>('/bitacora', { params: limpio(f) }).then((r) => r.data),
  filtros: () => api.get<{ obras: { id: string; nombre: string }[]; usuarios: { id: string; nombre: string }[]; modulos: string[]; sinObra: boolean }>('/bitacora/filtros').then((r) => r.data),
  exportar: (f: FiltroBitacora) => descargar(`/bitacora/exportar?${new URLSearchParams(limpio(f) as Record<string, string>)}`, 'bitacora.xlsx'),
  auditoria: (tabla: string, registroId: string) => api.get<RegistroAuditoria[]>('/auditoria', { params: { tabla, registroId } }).then((r) => r.data),
};
function limpio(f: object) {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}
export const configAPI = {
  parametros: () => api.get<Parametro[]>('/catalogo/parametros').then((r) => r.data),
  guardarParametros: (parametros: { clave: string; valor: string }[]) => api.put<Parametro[]>('/catalogo/parametros', { parametros }).then((r) => r.data),
  rendimientos: () => api.get<Rendimiento[]>('/catalogo/rendimientos').then((r) => r.data),
  crearRendimiento: (d: Omit<Rendimiento, 'id'>) => api.post('/catalogo/rendimientos', d).then((r) => r.data),
  actualizarRendimiento: (id: number, d: Omit<Rendimiento, 'id'>) => api.patch(`/catalogo/rendimientos/${id}`, d).then((r) => r.data),
};
export const reportesAPI = {
  obra: (obraId: string, desde?: string, hasta?: string) => api.get<ReporteObra>(`/obras/${obraId}/reporte`, { params: limpio({ desde, hasta }) }).then((r) => r.data),
  exportarObra: (obraId: string, nombre: string, desde?: string, hasta?: string) =>
    descargar(`/obras/${obraId}/reporte/exportar?${new URLSearchParams(limpio({ desde, hasta }) as Record<string, string>)}`, nombre),
  general: (p: { desde?: string; hasta?: string; obras?: string }) => api.get<ReporteGeneral>('/reportes/general', { params: limpio(p) }).then((r) => r.data),
  impreso: (p: { desde?: string; hasta?: string; obras?: string }) => api.get('/reportes/general/impreso', { params: limpio(p) }).then((r) => r.data),
};
const TOKEN_COSTEO = 'costeoToken';
const hc = () => ({ headers: { 'X-Costeo-Token': sessionStorage.getItem(TOKEN_COSTEO) ?? '' } });
const guardarSesionCosteo = (r: { token: string }) => {
  sessionStorage.setItem(TOKEN_COSTEO, r.token);
  return r;
};
export const costeoAPI = {
  token: () => sessionStorage.getItem(TOKEN_COSTEO),
  olvidarToken: () => sessionStorage.removeItem(TOKEN_COSTEO),
  estado: () => api.get<{ tienePin: boolean; minutos: number }>('/costeo/estado').then((r) => r.data),
  crearPin: (pinNuevo: string, pinActual?: string) => api.post<{ token: string }>('/costeo/pin', { pinNuevo, pinActual }).then((r) => guardarSesionCosteo(r.data)),
  restablecerPin: (password: string, pinNuevo: string) => api.post<{ token: string }>('/costeo/pin/restablecer', { password, pinNuevo }).then((r) => guardarSesionCosteo(r.data)),
  desbloquear: (pin: string) => api.post<{ token: string }>('/costeo/desbloquear', { pin }).then((r) => guardarSesionCosteo(r.data)),
  bloquear: () => api.post('/costeo/bloquear', {}, hc()).finally(() => sessionStorage.removeItem(TOKEN_COSTEO)),
  obras: () => api.get<{ id: string; nombre: string; cliente: string | null; estado: EstadoObra; conCosteo: boolean }[]>('/costeo/obras', hc()).then((r) => r.data),
  obra: (id: string) => api.get<CosteoObra>(`/costeo/obras/${id}`, hc()).then((r) => r.data),
  guardarRubro: (obraId: string, rubroId: string, d: { mat: number | null; mo: number; eq: number; sub: number; otr: number }) =>
    api.put<CosteoObra>(`/costeo/obras/${obraId}/rubros/${rubroId}`, d, hc()).then((r) => r.data),
  guardarIndirectos: (obraId: string, items: { descripcion: string; tipo: 'PCT' | 'MONTO'; valor: number }[]) =>
    api.put<CosteoObra>(`/costeo/obras/${obraId}/indirectos`, { items }, hc()).then((r) => r.data),
  guardarMaterial: (obraId: string, materialId: number, costo: number | null) =>
    api.put<CosteoObra>(`/costeo/obras/${obraId}/materiales/${materialId}`, { costo }, hc()).then((r) => r.data),
  exportar: async (obraId: string, nombre: string) => {
    const r = await api.get(`/costeo/obras/${obraId}/exportar`, { ...hc(), responseType: 'blob' });
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  },
};
export const accesosAPI = {
  listar: (obraId: string) => api.get<AccesoExterno[]>(`/obras/${obraId}/accesos`).then((r) => r.data),
  crear: (obraId: string, d: { tipo: 'DOCUMENTO' | 'CONTRATISTA'; requisito?: string; obraContratistaId?: string; nombre: string; email: string }) =>
    api.post<AccesoExterno>(`/obras/${obraId}/accesos`, d).then((r) => r.data),
  cancelar: (obraId: string, id: string) => api.post(`/obras/${obraId}/accesos/${id}/cancelar`).then((r) => r.data),
  verPublico: (token: string) => api.get<CargaPublica>(`/publico/cargas/${token}`).then((r) => r.data),
  subirPublico: (token: string, archivo: File, documento?: string, vence?: string) =>
    subirMultipart<CargaPublica>(`/publico/cargas/${token}`, archivo, 'post', Object.fromEntries(Object.entries({ documento, vence }).filter(([, v]) => v)) as Record<string, string>).then((r) => r.data),
};

export const dashboardAPI = {
  datos: () => api.get<DatosDashboard>('/dashboard').then((r) => r.data),
};

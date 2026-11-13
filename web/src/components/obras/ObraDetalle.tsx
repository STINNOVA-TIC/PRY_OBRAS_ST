import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BsChevronLeft, BsPauseCircle, BsPencil, BsPlayCircle, BsStopCircle, BsTrash } from 'react-icons/bs';
import { obrasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { FUNCION_OBRA, type Obra } from '../../types';
import { EstadoObraChip, fmtFecha, fmtUSD } from '../common/EstadoChip';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { BodegaVista } from '../bodega/BodegaVista';
import { AvancesObra } from '../ejecucion/AvancesObra';
import { ProgramaObra } from '../ejecucion/ProgramaObra';
import { RubrosObra } from '../ejecucion/RubrosObra';
import { HabilitacionObra } from '../habilitacion/HabilitacionObra';
import { PlanillasObra } from '../planillas/PlanillasObra';
import { ReporteObra } from '../reportes/ReporteObra';
import { VistaBitacora } from '../bitacora/Bitacora';
import { EquipoObra } from './EquipoObra';
import { ModalObra } from './ModalObra';

type Tab = 'resumen' | 'equipo' | 'habilitacion' | 'rubros' | 'programa' | 'avances' | 'bodega' | 'planillas' | 'reporte' | 'historial';

export const ObraDetalle: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showConfirm } = useModal();
  const [obra, setObra] = useState<Obra | null>(null);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'resumen');
  const [editar, setEditar] = useState(false);
  const [cambioEstado, setCambioEstado] = useState<null | 'ACTIVA' | 'PAUSADA' | 'CERRADA'>(null);

  const cargar = useCallback(async () => {
    try {
      const o = await obrasAPI.obtener(id);
      setObra(o);
      setTab((t) => (t === 'resumen' && o.estado === 'HABILITACION' ? 'habilitacion' : t));
    } catch (e) {
      setError(mensajeError(e, 'No se pudo cargar la obra'));
    }
  }, [id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error && !obra) return <div className="space-y-4"><Aviso tipo="error">{error}</Aviso><Link to="/obras" className="text-xs font-semibold text-gray-600">‹ Volver a obras</Link></div>;
  if (!obra) return <Cargando texto="Cargando obra..." />;

  const enHab = obra.estado === 'HABILITACION';
  const pct = obra.montoContrato ? obra.montoEjecutado / obra.montoContrato : 0;
  const tabs: [Tab, string, boolean][] = [
    ['resumen', 'Resumen', true],
    ['habilitacion', 'Requisitos y aprobación', true],
    ['equipo', `Equipo (${obra.totalMiembros})`, true],
    ['rubros', 'Rubros', true],
    ['avances', 'Avances', !enHab],
    ['programa', 'Programa', true],
    ['bodega', 'Bodega', true],
    ['planillas', 'Planillas', !enHab && hasPermission('planillas.ver')],
    ['reporte', 'Reporte', !enHab && hasPermission('reportes.ver')],
    ['historial', 'Historial', hasPermission('bitacora.ver')],
  ];

  const eliminar = async () => {
    if (!(await showConfirm({ title: 'Eliminar obra', message: `¿Eliminar «${obra.nombre}»? Solo es posible si no tiene avances, planillas ni movimientos de bodega.`, confirmLabel: 'Eliminar', type: 'danger' }))) return;
    try {
      await obrasAPI.eliminar(obra.id);
      navigate('/obras');
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <div className="font-sans space-y-6">
      <div className="space-y-3">
        <Link to="/obras" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800">
          <BsChevronLeft /> Obras
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-800">{obra.nombre}</h1>
              <EstadoObraChip estado={obra.estado} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {[obra.codigo, obra.cliente, obra.ubicacion, obra.provincia].filter(Boolean).join(' · ') || 'Sin datos de cliente ni ubicación'}
              {obra.fechaInicio && ` · Plazo: ${fmtFecha(obra.fechaInicio)}${obra.fechaFin ? ' a ' + fmtFecha(obra.fechaFin) : ''}`}
            </p>
            {obra.miFuncion && <p className="text-[11px] text-gray-400 mt-0.5">Tu función: {FUNCION_OBRA[obra.miFuncion]}</p>}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {hasPermission('obras.editar') && obra.estado !== 'CERRADA' && (
              <button className={btnSecundario} onClick={() => setEditar(true)}><BsPencil className="inline mr-1.5" />Editar</button>
            )}
            {hasPermission('obras.cambiar_estado') && obra.estado === 'ACTIVA' && (
              <button className={btnSecundario} onClick={() => setCambioEstado('PAUSADA')}><BsPauseCircle className="inline mr-1.5" />Suspender</button>
            )}
            {hasPermission('obras.cambiar_estado') && obra.estado === 'PAUSADA' && (
              <button className={btnSecundario} onClick={() => setCambioEstado('ACTIVA')}><BsPlayCircle className="inline mr-1.5" />Reactivar</button>
            )}
            {hasPermission('obras.cambiar_estado') && ['ACTIVA', 'PAUSADA'].includes(obra.estado) && (
              <button className={btnSecundario} onClick={() => setCambioEstado('CERRADA')}><BsStopCircle className="inline mr-1.5" />Cerrar obra</button>
            )}
            {hasPermission('obras.eliminar') && enHab && (
              <button className="px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold" onClick={eliminar} title="Eliminar obra"><BsTrash /></button>
            )}
          </div>
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {enHab && (
          <Aviso tipo="alerta">
            Esta obra aún no está habilitada. Completa los requisitos previos y obtén la firma del Administrador del contrato y del Superintendente para registrar avances.
          </Aviso>
        )}
      </div>

      {!enHab && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi valor={`${(pct * 100).toFixed(1)}%`} etiqueta="Avance económico" />
          <Kpi valor={fmtUSD(obra.montoEjecutado)} etiqueta="Ejecutado" />
          <Kpi valor={fmtUSD(obra.montoContrato)} etiqueta="Monto contrato" />
          <Kpi valor={fmtUSD(obra.montoContrato - obra.montoEjecutado)} etiqueta="Saldo" />
        </div>
      )}

      <div className="menu-scrollbar-hidden flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.filter(([, , v]) => v).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`shrink-0 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition ${
              tab === k ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <Resumen obra={obra} />}
      {tab === 'equipo' && <EquipoObra obra={obra} onCambio={setObra} />}
      {tab === 'habilitacion' && <HabilitacionObra obra={obra} irAEquipo={() => setTab('equipo')} onObraCambio={cargar} />}
      {tab === 'rubros' && <RubrosObra obra={obra} onCambio={cargar} />}
      {tab === 'avances' && <AvancesObra obra={obra} onCambio={cargar} />}
      {tab === 'programa' && <ProgramaObra obra={obra} />}
      {tab === 'bodega' && obra.bodegaId && <BodegaVista bodegaId={obra.bodegaId} onCambio={cargar} />}
      {tab === 'planillas' && <PlanillasObra obra={obra} />}
      {tab === 'reporte' && <ReporteObra obra={obra} />}
      {tab === 'historial' && <VistaBitacora obraId={obra.id} />}

      <ModalObra abierto={editar} obra={obra} onCerrar={() => setEditar(false)} onGuardada={(o) => { setEditar(false); setObra(o); }} />
      <ModalCambioEstado
        estado={cambioEstado}
        obra={obra}
        onCerrar={() => setCambioEstado(null)}
        onHecho={(o) => { setCambioEstado(null); setObra(o); }}
      />
    </div>
  );
};

const Kpi: React.FC<{ valor: string; etiqueta: string }> = ({ valor, etiqueta }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-4">
    <div className="text-lg font-black text-gray-800 truncate">{valor}</div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{etiqueta}</div>
  </div>
);

const Resumen: React.FC<{ obra: Obra }> = ({ obra }) => {
  const filas: [string, React.ReactNode][] = [
    ['Cliente', obra.cliente],
    ['Código', obra.codigo],
    ['Ubicación', obra.ubicacion],
    ['Provincia', obra.provincia],
    ['Inicio', fmtFecha(obra.fechaInicio)],
    ['Fin', fmtFecha(obra.fechaFin)],
    ['Plazo', obra.plazoTexto],
    ['Administrador del contrato', obra.administradorNombre],
    ['Superintendente de obra', obra.superintendenteNombre],
    ['Habilitada el', obra.habilitadaEn ? fmtFecha(obra.habilitadaEn) : null],
    ['Días laborables por semana', obra.diasLaborablesSemana],
  ];
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-gray-50 pb-2">
            <dt className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">{k}</dt>
            <dd className="text-gray-800 font-semibold text-right">{v || <span className="text-gray-300">—</span>}</dd>
          </div>
        ))}
      </dl>
      {obra.descripcion && <p className="text-xs text-gray-600 mt-4 whitespace-pre-line">{obra.descripcion}</p>}
    </section>
  );
};


const ModalCambioEstado: React.FC<{
  estado: null | 'ACTIVA' | 'PAUSADA' | 'CERRADA';
  obra: Obra;
  onCerrar: () => void;
  onHecho: (o: Obra) => void;
}> = ({ estado, obra, onCerrar, onHecho }) => {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setMotivo('');
    setError('');
  }, [estado]);
  if (!estado) return null;
  const titulo = { ACTIVA: 'Reactivar obra', PAUSADA: 'Suspender obra', CERRADA: 'Cerrar obra' }[estado];
  const guardar = async () => {
    if (motivo.trim().length < 5) return setError('Indica el motivo (mínimo 5 caracteres)');
    try {
      onHecho(await obrasAPI.cambiarEstado(obra.id, estado, motivo.trim()));
    } catch (e) {
      setError(mensajeError(e));
    }
  };
  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={obra.nombre}
      onCerrar={onCerrar}
      ancho="md"
      pie={
        <>
          <button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button className={btnPrimario} onClick={guardar}>{titulo}</button>
        </>
      }
    >
      <div className="space-y-3">
        {estado === 'CERRADA' && <Aviso tipo="alerta">Al cerrar la obra ya no se podrán registrar avances, movimientos ni planillas.</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo etiqueta="Motivo (queda en la bitácora)">
          <textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
      </div>
    </Modal>
  );
};

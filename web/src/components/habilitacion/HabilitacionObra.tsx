import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BsCheckCircleFill, BsCircle, BsPenFill, BsPlusLg } from 'react-icons/bs';
import { habilitacionAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Habilitacion, Obra } from '../../types';
import { FirmaImagen } from '../common/FirmaImagen';
import { FlujoFirmas, type NodoFirma } from '../common/FlujoFirmas';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { ContratistaDocumentos, ModalAgregarContratista } from './ContratistaDocumentos';
import { RequisitoCard } from './RequisitoCard';
import { AccesosExternos } from './AccesosExternos';

/** Pestaña "Requisitos y aprobación": requisitos, contratistas con documentos y firmas (patrón POS). */
export const HabilitacionObra: React.FC<{ obra: Obra; irAEquipo: () => void; onObraCambio: () => void }> = ({ obra, irAEquipo, onObraCambio }) => {
  const { user, hasPermission, esPropietario } = useAuth();
  const [h, setH] = useState<Habilitacion | null>(null);
  const [error, setError] = useState('');
  const [agregar, setAgregar] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [reemplazo, setReemplazo] = useState(false);

  const cargar = useCallback(() => habilitacionAPI.obtener(obra.id).then(setH).catch((e) => setError(mensajeError(e))), [obra.id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizar = (nueva: Habilitacion) => {
    const cambioEstado = nueva.obra.estado !== h?.obra.estado;
    setH(nueva);
    if (cambioEstado) onObraCambio(); // se habilitó: refrescar la ficha completa
  };

  if (!h) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando habilitación..." />;

  const enHab = h.obra.estado === 'HABILITACION';
  const noCerrada = h.obra.estado !== 'CERRADA';
  const pct = Math.round((h.progreso.hechos / h.progreso.total) * 100);

  const miPaso = h.firmas.find((f) => f.designadoId === user?.id && !f.firmado);
  const puedoFirmar = enHab && !!miPaso && hasPermission('habilitacion.firmar');
  const pasoSup = h.firmas.find((f) => f.rol === 'SUPERINTENDENTE');
  const puedoReemplazo =
    enHab && h.progreso.completo && (esPropietario || hasPermission('habilitacion.reemplazo')) &&
    !!pasoSup && !pasoSup.firmado && pasoSup.designadoId !== user?.id && !miPaso && !h.firmas.some((f) => f.firmadoPor === user?.id);

  const nodos: NodoFirma[] = h.firmas.map((f) => ({
    rol: f.rol,
    etiqueta: f.etiqueta,
    designadoNombre: f.designadoNombre,
    firmado: f.firmado,
    firmaArchivoId: f.firmaArchivoId,
    nombreFirmante: f.nombreFirmante,
    cargoFirmante: f.cargoFirmante,
    firmadoEn: f.firmadoEn,
    esReemplazo: f.esReemplazo,
    motivo: f.motivo,
    activo: enHab && h.progreso.completo,
  }));

  const acciones: Record<string, React.ReactNode> = {};
  if (puedoFirmar && miPaso) {
    acciones[miPaso.rol] = h.progreso.completo ? (
      <button className="whitespace-nowrap px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm" onClick={() => setFirmando(true)}>
        <BsPenFill className="inline mr-1.5" /> Firmar aprobación
      </button>
    ) : (
      <span className="text-[11px] text-gray-400 italic text-center">Podrás firmar cuando todo esté completo</span>
    );
  }
  if (puedoReemplazo && pasoSup) {
    acciones[pasoSup.rol] = (
      <button className={btnSecundario} onClick={() => setReemplazo(true)}>Firmar en reemplazo</button>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Aviso tipo="error">{error}</Aviso>}

      {/* Progreso */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-gray-800">{enHab ? 'Avance de la habilitación' : 'Habilitación completada'}</h2>
          <span className="text-xs font-bold text-gray-700">{h.progreso.hechos} de {h.progreso.total}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${h.progreso.completo ? 'bg-emerald-500' : 'bg-gray-800'}`} style={{ width: `${pct}%` }} />
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {h.progreso.items.map((i) => (
            <li key={i.clave} className={`text-[11px] flex items-center gap-1.5 ${i.ok ? 'text-emerald-700 font-semibold' : 'text-gray-500'}`}>
              {i.ok ? <BsCheckCircleFill /> : <BsCircle />} {i.nombre}
            </li>
          ))}
        </ul>
      </section>

      {/* Aprobación con firmas */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Aprobación de la habilitación</h2>
            <p className="text-[11px] text-gray-500">
              {enHab
                ? 'Firman el Administrador del contrato y el Superintendente, en cualquier orden. Con ambas firmas la obra pasa a «En ejecución». Cualquier cambio en requisitos o documentos reinicia las firmas.'
                : 'Firmas que habilitaron la obra.'}
            </p>
          </div>
          {enHab && hasPermission('obras.gestionar_equipo') && <button className={btnSecundario} onClick={irAEquipo}>Designar firmantes</button>}
        </div>
        {enHab && <AvisoFirmas h={h} miPaso={!!miPaso} puedeFirmar={hasPermission('habilitacion.firmar')} />}
        <FlujoFirmas paralelo nodos={nodos} acciones={acciones} />
      </section>

      {/* Requisitos administrativos */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Requisitos administrativos</h2>
          <p className="text-[11px] text-gray-500">Cada requisito necesita su archivo, la confirmación y el OK de revisión.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {h.requisitos.map((r) => (
            <RequisitoCard
              key={r.codigo}
              obraId={obra.id}
              r={r}
              puedeCargar={enHab && hasPermission('habilitacion.cargar')}
              puedeRevisar={enHab && hasPermission('habilitacion.revisar')}
              onCambio={actualizar}
            />
          ))}
        </div>
      </section>

      {/* Contratistas */}
      <section className="space-y-3">
        <div className="flex justify-between items-end gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Contratistas y documentos habilitantes</h2>
            <p className="text-[11px] text-gray-500">Debe haber al menos un contratista y todos sus documentos aprobados por SIG y vigentes.</p>
          </div>
          {noCerrada && hasPermission('habilitacion.cargar') && (
            <button className={btnPrimario} onClick={() => setAgregar(true)}><BsPlusLg className="inline mr-1.5" />Agregar contratista</button>
          )}
        </div>
        {!h.contratistas.length && (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-10 text-center text-xs text-gray-500">Aún no hay contratistas en esta obra.</div>
        )}
        {h.contratistas.map((c) => (
          <ContratistaDocumentos
            key={c.id}
            obraId={obra.id}
            c={c}
            permisos={{ cargar: hasPermission('habilitacion.cargar'), revisarSig: hasPermission('habilitacion.revisar_sig'), puedeModificar: noCerrada }}
            onCambio={actualizar}
          />
        ))}
      </section>

      {noCerrada && hasPermission('habilitacion.accesos_externos') && <AccesosExternos h={h} />}

      <ModalAgregarContratista
        abierto={agregar}
        obraId={obra.id}
        yaEnObra={h.contratistas.map((c) => c.contratistaId)}
        puedeCrear={hasPermission('contratistas.gestionar')}
        onCerrar={() => setAgregar(false)}
        onHecho={(n) => { setAgregar(false); actualizar(n); }}
      />
      <ModalFirmar
        abierto={firmando}
        etiqueta={miPaso?.etiqueta ?? ''}
        obraNombre={obra.nombre}
        onCerrar={() => setFirmando(false)}
        onFirmar={async () => { actualizar(await habilitacionAPI.firmar(obra.id)); setFirmando(false); }}
      />
      <ModalReemplazo
        abierto={reemplazo}
        onCerrar={() => setReemplazo(false)}
        onFirmar={async (motivo) => { actualizar(await habilitacionAPI.firmarReemplazo(obra.id, motivo)); setReemplazo(false); }}
      />
    </div>
  );
};

/** Explica por qué un paso está "En espera" y qué falta para poder firmar. */
const AvisoFirmas: React.FC<{ h: Habilitacion; miPaso: boolean; puedeFirmar: boolean }> = ({ h, miPaso, puedeFirmar }) => {
  const sinDesignar = h.firmas.filter((f) => !f.designadoId).map((f) => f.etiqueta);
  if (sinDesignar.length)
    return <Aviso tipo="alerta">Falta designar: {sinDesignar.join(' y ')}. Hazlo en la pestaña «Equipo» con «Designar firmantes».</Aviso>;
  if (!h.progreso.completo) {
    const faltan = h.progreso.items.filter((i) => !i.ok).map((i) => i.nombre);
    return <Aviso>Las firmas se habilitan cuando el avance llegue a {h.progreso.total} de {h.progreso.total}. Falta: {faltan.join(', ')}.</Aviso>;
  }
  const pendientes = h.firmas.filter((f) => !f.firmado);
  if (miPaso && !puedeFirmar) return <Aviso tipo="alerta">Eres firmante, pero tu rol no tiene el permiso «habilitacion.firmar». Pide al propietario que lo active.</Aviso>;
  if (miPaso) return <Aviso tipo="ok">Todo está completo: ya puedes firmar con el botón «Firmar aprobación» de tu paso.</Aviso>;
  return <Aviso>Todo está completo. Esperando la firma de: {pendientes.map((f) => f.designadoNombre).join(' y ')}. Solo el firmante designado puede firmar su paso.</Aviso>;
};

/** Confirmación de firma con vista previa de la firma que se estampará (como en el POS). */
const ModalFirmar: React.FC<{ abierto: boolean; etiqueta: string; obraNombre: string; onCerrar: () => void; onFirmar: () => Promise<void> }> = ({
  abierto, etiqueta, obraNombre, onCerrar, onFirmar,
}) => {
  const { user, refrescarUsuario } = useAuth();
  const [archivoFirma, setArchivoFirma] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    setError('');
    import('../../api').then(({ authAPI }) => authAPI.perfil().then((p) => setArchivoFirma(p.firmaArchivoId)));
  }, [abierto]);

  const firmar = async () => {
    setOcupado(true);
    setError('');
    try {
      await onFirmar();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo firmar'));
      refrescarUsuario();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Firmar aprobación de habilitación" subtitulo={obraNombre} onCerrar={onCerrar} ancho="md"
      pie={user?.tieneFirma ? (
        <><button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button className="whitespace-nowrap px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50" onClick={firmar} disabled={ocupado}>
            {ocupado ? 'Firmando...' : 'Confirmar y firmar'}</button></>
      ) : <button className={btnSecundario} onClick={onCerrar}>Cerrar</button>}>
      <div className="space-y-4">
        {user?.tieneFirma ? (
          <>
            <p className="text-xs text-gray-600">Firmarás como <b>{etiqueta}</b>. Se estampará esta firma con tu nombre, cargo y la fecha y hora actuales:</p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 h-32 flex items-center justify-center">
              {archivoFirma ? <FirmaImagen archivoId={archivoFirma} className="max-h-24 object-contain" /> : <span className="text-xs text-gray-400">Cargando firma...</span>}
            </div>
            <p className="text-center text-[11px] font-bold uppercase text-gray-700">{user.nombre}{user.cargo ? ` · ${user.cargo}` : ''}</p>
          </>
        ) : (
          <Aviso tipo="alerta">Aún no registras tu firma. <Link to="/perfil" className="underline font-bold">Súbela en «Mi perfil y firma»</Link> y vuelve para firmar.</Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

const ModalReemplazo: React.FC<{ abierto: boolean; onCerrar: () => void; onFirmar: (motivo: string) => Promise<void> }> = ({ abierto, onCerrar, onFirmar }) => {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setMotivo(''); setError(''); }, [abierto]);
  const firmar = async () => {
    if (motivo.trim().length < 5) return setError('Indica el motivo del reemplazo');
    try {
      await onFirmar(motivo.trim());
    } catch (e) {
      setError(mensajeError(e));
    }
  };
  return (
    <Modal abierto={abierto} titulo="Firmar en reemplazo del superintendente" onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={firmar}>Firmar en reemplazo</button></>}>
      <div className="space-y-3">
        <Aviso tipo="alerta">Tu firma quedará estampada en el paso del Superintendente, marcada como reemplazo y con el motivo.</Aviso>
        <Campo etiqueta="Motivo"><textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Se encuentra de descanso" autoFocus /></Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

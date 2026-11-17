import React, { useCallback, useEffect, useState } from 'react';
import { BsArrowClockwise, BsCheckCircleFill, BsClock, BsCloudArrowDown, BsDatabaseFillCheck, BsDownload, BsExclamationTriangleFill, BsHddStack } from 'react-icons/bs';
import { respaldosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useModal } from '../../context/ModalContext';
import type { ResumenRespaldos } from '../../types';
import { Aviso, Cargando, btnPrimario, btnSecundario } from '../common/Modal';

const tam = (b?: number | null) => {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};
const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Administración → Respaldos: horario automático, respaldo manual y descarga. Solo administrador y propietario. */
export const PaginaRespaldos: React.FC = () => {
  const { showConfirm } = useModal();
  const [r, setR] = useState<ResumenRespaldos | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [bajando, setBajando] = useState<string | null>(null);

  const cargar = useCallback(() => respaldosAPI.resumen().then((d) => { setR(d); setError(''); }).catch((e) => setError(mensajeError(e))), []);
  useEffect(() => { cargar(); }, [cargar]);

  // Mientras hay un respaldo en curso, consulta cada 3 s hasta que termine
  const enCurso = !!r?.estado.enCurso;
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => {
      respaldosAPI.resumen().then((d) => {
        setR(d);
        if (!d.estado.enCurso && d.estado.ultimo) setAviso(d.estado.ultimo.ok ? `✓ ${d.estado.ultimo.mensaje}` : '');
      }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [enCurso]);

  const respaldarAhora = async () => {
    const ok = await showConfirm({
      title: 'Crear respaldo en el servidor',
      message: 'Se guardará una copia completa de la base de datos y de todos los archivos subidos. Puede tardar unos minutos y el sistema sigue funcionando mientras tanto.',
      confirmLabel: 'Crear respaldo',
      type: 'info',
    });
    if (!ok) return;
    setAviso('');
    try {
      await respaldosAPI.iniciar();
      await cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const bajar = async (nombre: string) => {
    setBajando(nombre);
    try { await respaldosAPI.descargar(nombre); } catch (e) { setError(mensajeError(e)); } finally { setTimeout(() => setBajando(null), 1500); }
  };

  const descargarDirecto = async () => {
    const ok = await showConfirm({
      title: 'Descargar respaldo directo',
      message: 'Se genera ahora una copia completa (base de datos y todos los archivos subidos) y se descarga a este equipo sin guardarla en el servidor. Según el tamaño, la descarga puede tardar en empezar unos minutos: no cierres la pestaña.',
      confirmLabel: 'Generar y descargar',
      type: 'info',
    });
    if (!ok) return;
    setError('');
    setBajando('directo');
    try {
      await respaldosAPI.descargar();
      setAviso('Generando el respaldo: la descarga empezará en tu navegador en cuanto esté listo.');
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setTimeout(() => setBajando(null), 4000);
    }
  };

  if (!r && !error) return <Cargando />;
  const ultimo = r?.respaldos[0];
  const falla = r?.estado.ultimo && !r.estado.ultimo.ok ? r.estado.ultimo : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Respaldos</h1>
          <p className="text-xs text-gray-500 mt-1">Copias completas de la base de datos (obras, usuarios, avances, bodega, planillas, bitácora) y de todos los archivos subidos (firmas, PDF, fotos).</p>
        </div>
        <div className="flex gap-2">
          <button className={btnSecundario} onClick={cargar} title="Actualizar"><BsArrowClockwise className="inline mr-1.5" />Actualizar</button>
          {r?.configurado && (
            <>
              <button className={btnPrimario} onClick={respaldarAhora} disabled={enCurso} title="Guarda una copia completa en el servidor">
                <BsDatabaseFillCheck className="inline mr-1.5" />{enCurso ? 'Respaldando...' : 'Crear en servidor'}
              </button>
              <button className="whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50" onClick={descargarDirecto} disabled={bajando === 'directo'} title="Genera una copia completa y la descarga a este equipo">
                <BsDownload className="inline mr-1.5" />{bajando === 'directo' ? 'Preparando...' : 'Descargar directo'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {falla && !enCurso && <Aviso tipo="error">El último respaldo manual falló ({fecha(falla.fin)}): {falla.mensaje}</Aviso>}
      {enCurso && <Aviso tipo="info">Respaldo en curso, iniciado por {r?.estado.usuario}. Puedes seguir trabajando; esta pantalla se actualiza sola.</Aviso>}

      {r && !r.configurado && (
        <Aviso tipo="alerta">Los respaldos no están configurados en este servidor. TIC debe definir <b>BACKUP_DIR</b> en el archivo .env y reiniciar el sistema.</Aviso>
      )}

      {r?.configurado && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-800"><BsClock />Respaldo automático</div>
              <div className="mt-1 text-lg font-black text-gray-900">{r.horario.texto}</div>
              <div className="text-[11px] text-gray-600">{r.horario.zona}. No hace falta hacer nada: se guarda solo.</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500"><BsCheckCircleFill className="text-emerald-600" />Último respaldo</div>
              <div className="mt-1 text-lg font-black text-gray-900">{ultimo ? fecha(ultimo.momento) : 'Aún no hay respaldos'}</div>
              <div className="text-[11px] text-gray-600">{ultimo ? `Base ${tam(ultimo.bd?.bytes)} · Archivos ${tam(ultimo.adjuntos?.bytes)}` : 'Crea el primero con el botón de arriba'}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                {r.disco && r.disco.librePct < 15 ? <BsExclamationTriangleFill className="text-red-600" /> : <BsHddStack />}Espacio
              </div>
              <div className="mt-1 text-lg font-black text-gray-900">{r.total} respaldo{r.total === 1 ? '' : 's'} · {tam(r.tamanoTotal)}</div>
              <div className={`text-[11px] ${r.disco && r.disco.librePct < 15 ? 'font-bold text-red-700' : 'text-gray-600'}`}>
                {r.disco ? `Disco libre: ${tam(r.disco.libreBytes)} (${r.disco.librePct} %)` : 'Disco libre: no disponible'}
                {r.disco && r.disco.librePct < 15 ? ' · copia los respaldos fuera del servidor' : ''}
              </div>
            </div>
          </div>

          <Aviso tipo="info">
            <b>Crear en servidor</b> guarda la copia en el servidor y aparece en la lista. <b>Descargar directo</b> genera una copia completa y la baja a tu equipo
            (un archivo .tar con la base y los archivos subidos) sin ocupar espacio en el servidor. Los respaldos <b>no se borran</b>: se conservan todos.
            Restaurar un respaldo reemplaza los datos actuales, por eso solo lo hace TIC desde el servidor.
          </Aviso>

          <section className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-800">Respaldos guardados</h2>
              {r.total > r.respaldos.length && <span className="text-[11px] text-gray-500">Se muestran los {r.respaldos.length} más recientes de {r.total}</span>}
            </div>
            {!r.respaldos.length ? (
              <p className="px-5 py-8 text-center text-xs text-gray-400">Aún no hay respaldos guardados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
                    <tr><th className="px-5 py-2.5">Fecha</th><th className="px-3 py-2.5">Base de datos</th><th className="px-3 py-2.5">Archivos subidos</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {r.respaldos.map((x) => (
                      <tr key={x.fecha}>
                        <td className="px-5 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{fecha(x.momento)}</td>
                        {(['bd', 'adjuntos'] as const).map((k) => (
                          <td key={k} className="px-3 py-2.5">
                            {x[k] ? (
                              <button className="inline-flex items-center gap-1.5 text-blue-700 hover:underline disabled:opacity-50" disabled={!!bajando} onClick={() => bajar(x[k]!.nombre)}>
                                <BsCloudArrowDown />{bajando === x[k]!.nombre ? 'Descargando...' : `Descargar · ${tam(x[k]!.bytes)}`}
                              </button>
                            ) : <span className="text-red-600">Falta</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {!!r.log.length && (
            <details className="rounded-2xl border border-gray-200 bg-white px-5 py-3">
              <summary className="cursor-pointer text-xs font-bold text-gray-700">Registro de respaldos (últimos {r.log.length})</summary>
              <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-gray-600">
                {r.log.map((l, i) => <li key={i} className={/ERROR/.test(l) ? 'text-red-700' : /AVISO/.test(l) ? 'text-amber-700' : ''}>{l}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
};

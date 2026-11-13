import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsBuildings, BsGeoAlt, BsPeople } from 'react-icons/bs';
import { obrasAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { ESTADO_OBRA, FUNCION_OBRA, type EstadoObra, type Obra } from '../../types';
import { BotonRecargar } from '../common/BotonRecargar';
import { EstadoObraChip, fmtFecha, fmtUSD } from '../common/EstadoChip';
import { Cargando, btnPrimario } from '../common/Modal';
import { SearchAndFilterBar } from '../common/SearchAndFilterBar';
import { ModalObra } from './ModalObra';

export const ObrasLista: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<string>('ALL');
  const [crear, setCrear] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setObras(await obrasAPI.listar());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    cargar();
  }, []);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return obras.filter(
      (o) =>
        (estado === 'ALL' || o.estado === estado) &&
        (!t || [o.nombre, o.codigo, o.cliente, o.ubicacion].some((x) => x?.toLowerCase().includes(t))),
    );
  }, [obras, q, estado]);

  const conteo = (e: EstadoObra) => obras.filter((o) => o.estado === e).length;

  if (loading && !obras.length) return <Cargando texto="Cargando obras..." />;

  return (
    <div className="font-sans space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Obras</h1>
          <p className="text-xs text-gray-500 mt-1">Obras de señalización vial: habilitación, ejecución y cierre</p>
        </div>
        <div className="flex items-center gap-2">
          <BotonRecargar onRefresh={cargar} loading={loading} />
          {hasPermission('obras.crear') && (
            <button onClick={() => setCrear(true)} className={btnPrimario}>
              Nueva obra
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(ESTADO_OBRA) as EstadoObra[]).map((e) => (
          <button
            key={e}
            onClick={() => setEstado(estado === e ? 'ALL' : e)}
            className={`text-left bg-white border rounded-2xl p-4 transition ${estado === e ? 'border-gray-800 ring-1 ring-gray-800' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <div className="text-2xl font-black text-gray-800">{conteo(e)}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{ESTADO_OBRA[e].label}</div>
          </button>
        ))}
      </div>

      <SearchAndFilterBar
        searchPlaceholder="Buscar por nombre, código, cliente o ubicación..."
        searchValue={q}
        onSearchChange={setQ}
        totalResults={filtradas.length}
        totalCount={obras.length}
        resultsLabel="obras"
        selectFilters={[
          {
            id: 'estado',
            placeholder: 'Todos los estados',
            value: estado,
            onChange: (v) => setEstado(v),
            options: (Object.keys(ESTADO_OBRA) as EstadoObra[]).map((e) => ({ label: ESTADO_OBRA[e].label, value: e })),
          },
        ]}
      />

      {!filtradas.length ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center">
          <BsBuildings className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">{obras.length ? 'Ninguna obra coincide con el filtro' : 'Aún no tienes obras asignadas'}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtradas.map((o) => {
            const pct = o.montoContrato ? o.montoEjecutado / o.montoContrato : 0;
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/obras/${o.id}`)}
                className="text-left bg-white border border-gray-200 hover:border-gray-400 hover:shadow-sm rounded-2xl p-5 transition space-y-3"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-800 truncate">{o.nombre}</h3>
                    <p className="text-[11px] text-gray-400 truncate">{[o.codigo, o.cliente].filter(Boolean).join(' · ') || 'Sin cliente'}</p>
                  </div>
                  <EstadoObraChip estado={o.estado} />
                </div>
                {o.ubicacion && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
                    <BsGeoAlt className="shrink-0" /> {o.ubicacion}
                  </p>
                )}
                <div>
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span>Avance económico</span>
                    <span className="font-bold text-gray-700">{(pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-800 rounded-full" style={{ width: `${Math.min(100, pct * 100)}%` }} />
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">
                    {fmtUSD(o.montoEjecutado)} de {fmtUSD(o.montoContrato)}
                  </div>
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                  <span className="flex items-center gap-1.5">
                    <BsPeople /> {o.totalMiembros} · {o.miFuncion ? FUNCION_OBRA[o.miFuncion] : 'Acceso general'}
                  </span>
                  <span>{o.fechaInicio ? `${fmtFecha(o.fechaInicio)}${o.fechaFin ? ' → ' + fmtFecha(o.fechaFin) : ''}` : 'Sin plazo'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ModalObra
        abierto={crear}
        onCerrar={() => setCrear(false)}
        onGuardada={(o) => {
          setCrear(false);
          navigate(`/obras/${o.id}`);
        }}
      />
    </div>
  );
};

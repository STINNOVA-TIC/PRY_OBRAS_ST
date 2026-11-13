import { fmtPeriodo } from '../planillas/comunes';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BsArrowDownRight, BsArrowRight, BsArrowUpRight, BsBuildings, BsExclamationTriangleFill, BsPenFill } from 'react-icons/bs';
import { dashboardAPI, firmasAPI, obrasAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { ESTADO_OBRA, type DatosDashboard, type EstadoObra, type FirmaPendiente, type Obra } from '../../types';
import { EstadoObraChip, fmtUSD } from '../common/EstadoChip';
import { Aviso, Cargando } from '../common/Modal';
import { AvanceObras, BarraEstados, BarrasH, BarrasMensuales, BarrasMes, C, fmtCorto } from './graficos';

export const DashboardHome: React.FC = () => {
  const { user, hasAnyPermission } = useAuth();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const veObras = hasAnyPermission('obras.ver', 'obras.ver_todas');
  const [pendientes, setPendientes] = useState<FirmaPendiente[]>([]);
  const [d, setD] = useState<DatosDashboard | null>(null);
  const [todasFirmas, setTodasFirmas] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    firmasAPI.pendientes().then(setPendientes).catch(() => setPendientes([]));
  }, []);

  useEffect(() => {
    if (veObras) {
      obrasAPI.listar().then(setObras).catch(() => setObras([]));
      dashboardAPI.datos().then(setD).catch(() => setD(null));
    } else setObras([]);
  }, [veObras]);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  if (!obras) return <Cargando />;

  return (
    <div className="font-sans space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{saludo}, {user?.nombre.split(' ')[0]}</h1>
        <p className="text-xs text-gray-500 mt-1">Resumen de tus obras</p>
      </div>

      {!user?.tieneFirma && (
        <Aviso tipo="alerta">
          <BsPenFill className="inline mr-1.5" />
          Aún no registras tu firma. La necesitarás para aprobar habilitaciones, planillas y transferencias.{' '}
          <Link to="/perfil" className="underline font-bold">Subir mi firma</Link>
        </Aviso>
      )}

      {pendientes.length > 0 && (
        <section className="bg-white border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
            <BsPenFill className="text-amber-600" />
            <h2 className="text-sm font-bold text-gray-800">Firmas pendientes</h2>
            <span className="ml-auto text-[11px] font-bold text-amber-700">{pendientes.length}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {(todasFirmas ? pendientes : pendientes.slice(0, 3)).map((p) =>
              p.tipo === 'HABILITACION' ? (
                <li key={`H-${p.obraId}-${p.rol}`}>
                  <Link to={`/obras/${p.obraId}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-800 truncate">Habilitación · {p.obraNombre}</div>
                      <div className="text-[11px] text-gray-500 truncate">Firmas como {p.etiqueta} · requisitos {p.progreso}</div>
                    </div>
                    {p.listo ? (
                      <span className="shrink-0 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border text-emerald-700 bg-emerald-50 border-emerald-200">Lista para firmar</span>
                    ) : (
                      <span className="shrink-0 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border text-gray-500 bg-gray-50 border-gray-200">En preparación</span>
                    )}
                  </Link>
                </li>
              ) : p.tipo === 'PLANILLA' ? (
                <li key={`P-${p.planillaId}`}>
                  <Link to={`/obras/${p.obraId}/planillas/${p.planillaId}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-800 truncate">Planilla N.º {p.numero} {p.tipoPlanilla === 'CLIENTE' ? 'al cliente' : `de ${p.contratistaNombre}`} · {p.obraNombre}</div>
                      <div className="text-[11px] text-gray-500 truncate">{fmtPeriodo(p.periodoDesde, p.periodoHasta)} · {fmtUSD(p.total)} · firmas como {p.etiqueta}</div>
                    </div>
                    <span className="shrink-0 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200">{p.rol === 'APROBADO' ? 'Aprobar' : 'Revisar'}</span>
                  </Link>
                </li>
              ) : (
                <li key={`T-${p.transferenciaId}`}>
                  <Link to={`/transferencias/${p.transferenciaId}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-800 truncate">Transferencia N.º {p.numero} · {p.origen} → {p.destino}</div>
                      <div className="text-[11px] text-gray-500 truncate">{p.materiales}</div>
                    </div>
                    <span className="shrink-0 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200">{p.etiqueta}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
          {pendientes.length > 3 && (
            <button className="w-full border-t border-gray-100 px-5 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900" onClick={() => setTodasFirmas(!todasFirmas)}>
              {todasFirmas ? 'Ver menos' : `Ver las ${pendientes.length} firmas pendientes`}
            </button>
          )}
        </section>
      )}

      {veObras && d && <Tablero d={d} onAbrir={(id) => navigate(`/obras/${id}`)} />}

      {veObras && (
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-sm font-bold text-gray-800">Mis obras</h2>
            <Link to="/obras" className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1">Ver todas <BsArrowRight /></Link>
          </div>
          {!obras.length ? (
            <div className="py-12 text-center">
              <BsBuildings className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Aún no tienes obras asignadas</p>
            </div>
          ) : (
            <ul className="grid md:grid-cols-2 divide-y divide-gray-100 md:divide-y-0">
              {obras.slice(0, 8).map((o) => (
                <li key={o.id} className="md:border-b md:border-gray-100">
                  <Link to={`/obras/${o.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-800 truncate">{o.nombre}</div>
                      <div className="text-[11px] text-gray-400 truncate">{o.cliente || 'Sin cliente'}</div>
                    </div>
                    <EstadoObraChip estado={o.estado} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

const COLOR_ESTADO: Record<EstadoObra, string> = { ACTIVA: C.s1, HABILITACION: C.s2, PAUSADA: C.s3, CERRADA: C.s4 };
const ETAPAS = [
  ['ELABORACION', 'En elaboración'],
  ['PRESENTADA', 'Presentadas'],
  ['APROBADA', 'Aprobadas (por cobrar)'],
  ['PAGADA', 'Pagadas'],
] as const;

const Tarjeta: React.FC<{ titulo: string; sub?: string; children: React.ReactNode; className?: string; accion?: React.ReactNode }> = ({ titulo, sub, children, className = '', accion }) => (
  <section className={`bg-white border border-gray-200 rounded-2xl p-5 ${className}`}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-gray-800">{titulo}</h2>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {accion}
    </div>
    {children}
  </section>
);

const Kpi: React.FC<{ valor: string; etiqueta: string; pie?: React.ReactNode; to?: string }> = ({ valor, etiqueta, pie, to }) => {
  const cuerpo = (
    <>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{etiqueta}</div>
      <div className="mt-1.5 text-2xl font-black text-gray-900 truncate">{valor}</div>
      {pie && <div className="mt-1.5 text-[11px] text-gray-500">{pie}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="block bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 transition">{cuerpo}</Link>
  ) : (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">{cuerpo}</div>
  );
};

/** Tablero tipo CRM: indicadores, tendencia mensual, avance vs. tiempo, estados, cobro y consumo. */
const Tablero: React.FC<{ d: DatosDashboard; onAbrir: (id: string) => void }> = ({ d, onAbrir }) => {
  const k = d.kpis;
  const delta = k.ejecutadoMesAnterior > 0 ? (k.ejecutadoMes - k.ejecutadoMesAnterior) / k.ejecutadoMesAnterior : null;
  const alertas = d.atrasadas + d.documentos.vencidos + d.documentos.porVencer;
  const totalObras = d.estados.reduce((s, x) => s + x.n, 0);
  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 gap-3 ${d.ver.planillas ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <Kpi etiqueta="Contratado en ejecución" valor={fmtCorto(k.contratado)} pie={`${d.estados.find((x) => x.estado === 'ACTIVA')?.n ?? 0} obras activas de ${totalObras}`} to="/obras" />
        <Kpi etiqueta="Ejecutado" valor={fmtCorto(k.ejecutado)} pie={
          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 rounded-full" style={{ background: C.pista }}><span className="block h-full rounded-full" style={{ width: `${Math.min(k.pct, 1) * 100}%`, background: C.s1 }} /></span>
            <b className="text-gray-700 tabular-nums">{(k.pct * 100).toFixed(1)} %</b>
          </span>
        } />
        <Kpi etiqueta="Ejecutado este mes" valor={fmtCorto(k.ejecutadoMes)} pie={
          delta == null ? 'Sin datos del mes anterior' : (
            <span className="font-semibold" style={{ color: delta >= 0 ? C.bien : C.critico }}>
              {delta >= 0 ? <BsArrowUpRight className="inline mr-0.5" /> : <BsArrowDownRight className="inline mr-0.5" />}
              {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(0)} % <span className="font-normal text-gray-500">vs. mismo tramo del mes anterior</span>
            </span>
          )
        } />
        {d.ver.planillas && <Kpi etiqueta="Por cobrar" valor={fmtCorto(k.porCobrar ?? 0)} pie={`Cobrado ${fmtCorto(k.cobrado ?? 0)} (con IVA)`} />}
        <Kpi etiqueta="Alertas" valor={String(alertas)} pie={
          alertas ? (
            <span style={{ color: C.critico }} className="font-semibold">
              <BsExclamationTriangleFill className="inline mr-1" />
              {[d.atrasadas && `${d.atrasadas} obra${d.atrasadas === 1 ? '' : 's'} atrasada${d.atrasadas === 1 ? '' : 's'}`,
                d.documentos.vencidos && `${d.documentos.vencidos} doc. vencido${d.documentos.vencidos === 1 ? '' : 's'}`,
                d.documentos.porVencer && `${d.documentos.porVencer} por vencer`].filter(Boolean).join(' · ')}
            </span>
          ) : 'Todo en orden'
        } />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Tarjeta className="lg:col-span-2" titulo={d.ver.planillas ? 'Ejecutado vs. planillado' : 'Ejecutado por mes'} sub="Últimos 12 meses, a precio de contrato (sin IVA)">
          <BarrasMensuales datos={d.mensual} conPlanillado={d.ver.planillas} />
        </Tarjeta>
        <div className="space-y-4">
          <Tarjeta titulo="Obras por estado" sub={`${totalObras} obras`}>
            <BarraEstados datos={(Object.keys(ESTADO_OBRA) as EstadoObra[]).map((e) => ({
              clave: e, etiqueta: ESTADO_OBRA[e].label, n: d.estados.find((x) => x.estado === e)?.n ?? 0, color: COLOR_ESTADO[e],
            }))} />
          </Tarjeta>
          {d.cobro && (
            <Tarjeta titulo="Embudo de cobro" sub="Planillas al cliente (total con IVA)">
              <BarrasH vacio="Aún no hay planillas al cliente."
                datos={ETAPAS.map(([e, t], i) => {
                  const x = d.cobro!.find((c) => c.etapa === e);
                  return { clave: e, etiqueta: t, valor: x?.total ?? 0, detalle: `${x?.n ?? 0} planilla${x?.n === 1 ? '' : 's'}`, color: C.ordinal[i] };
                })} />
            </Tarjeta>
          )}
        </div>
      </div>

      {d.facturacion && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Tarjeta className="lg:col-span-2" titulo="Facturado vs. cobrado" sub="Planillas al cliente aprobadas o pagadas, total con IVA · facturado por mes del período, cobrado por fecha de pago">
            <div className="mb-3 grid grid-cols-3 gap-3">
              {([['Facturado', d.facturacion.totales.facturado, C.s2], ['Cobrado', d.facturacion.totales.cobrado, C.s3], ['Pendiente de cobro', d.facturacion.totales.pendiente, null]] as const).map(([t, v, c]) => (
                <div key={t} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{c && <span className="h-2 w-2 rounded-sm" style={{ background: c }} />}{t}</div>
                  <div className="text-base font-black text-gray-900 tabular-nums">{fmtCorto(v)}</div>
                </div>
              ))}
            </div>
            <BarrasMes datos={d.facturacion.mensual} vacio="Aún no hay planillas aprobadas en los últimos 12 meses." aria="Facturado y cobrado por mes, últimos 12 meses"
              series={[{ clave: 'facturado', etiqueta: 'Facturado', color: C.s2 }, { clave: 'cobrado', etiqueta: 'Cobrado', color: C.s3 }]} />
          </Tarjeta>
          <Tarjeta titulo="Facturado por obra" sub="Las 6 de mayor monto facturado (con IVA)">
            <BarrasH vacio="Aún no hay planillas aprobadas."
              datos={d.facturacion.porObra.map((o) => ({
                clave: o.id, etiqueta: o.nombre, valor: o.facturado,
                detalle: `cobrado ${fmtCorto(o.cobrado)}`, color: C.s2,
              }))} />
          </Tarjeta>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Tarjeta className={d.consumo ? 'lg:col-span-2' : 'lg:col-span-3'} titulo="Avance por obra" sub="Avance económico frente al tiempo transcurrido del plazo · las 8 de mayor monto">
          <AvanceObras datos={d.avance} onAbrir={onAbrir} />
        </Tarjeta>
        {d.consumo && (
          <Tarjeta titulo="Consumo de materiales" sub="Este mes, valorizado al costo del catálogo">
            <BarrasH vacio={d.consumo.length ? 'Hay consumos, pero sus materiales no tienen costo en el catálogo.' : 'Sin consumos este mes.'}
              datos={d.consumo.map((m) => ({
                clave: String(m.id), etiqueta: m.nombre, valor: m.valor,
                detalle: `${m.cantidad.toLocaleString('es-EC', { maximumFractionDigits: 1 })} ${m.unidad}`, color: C.s1,
              }))} />
          </Tarjeta>
        )}
      </div>
    </div>
  );
};

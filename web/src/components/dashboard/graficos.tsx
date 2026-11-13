import React, { useRef, useState } from 'react';
import { BsExclamationTriangleFill } from 'react-icons/bs';
import { fmtUSD } from '../common/EstadoChip';

/**
 * Gráficos del tablero en SVG propio (sin librerías): marcas finas, extremos redondeados de 4px,
 * separación de 2px entre rellenos, rejilla tenue, leyenda + tooltip al pasar el mouse.
 * Paleta validada (categórica en orden fijo y rampa ordinal de un solo tono).
 */
export const C = {
  s1: '#2a78d6', // azul
  s2: '#eb6834', // naranja
  s3: '#1baf7a', // aqua
  s4: '#eda100', // amarillo
  ordinal: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'],
  grid: '#e1e0d9',
  eje: '#c3c2b7',
  muted: '#898781',
  tinta2: '#52514e',
  pista: '#f0efec',
  critico: '#d03b3b',
  bien: '#006300',
};

export const fmtCorto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toLocaleString('es-EC', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `$${(n / 1e3).toLocaleString('es-EC', { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} k`;
  return `$${n.toLocaleString('es-EC', { maximumFractionDigits: 0 })}`;
};
const pct = (v: number) => `${(v * 100).toLocaleString('es-EC', { maximumFractionDigits: 1 })} %`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = (ym: string, conAnio = false) => {
  const [y, m] = ym.split('-');
  return `${MESES[Number(m) - 1]}${conAnio ? ` ${y}` : ''}`;
};

/** Máximo «redondo» y 4 divisiones para el eje. */
function escala(max: number) {
  if (max <= 0) return { tope: 1, pasos: [0, 0.25, 0.5, 0.75, 1] };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= bruto)!;
  return { tope: paso * 4, pasos: [0, 1, 2, 3, 4].map((i) => i * paso) };
}

/** Barra con solo el extremo de datos redondeado (anclada a la base). */
function barraV(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ------------------------------------------------------------------ tooltip
interface Tip { x: number; y: number; contenido: React.ReactNode }
function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const mostrar = (e: React.MouseEvent, contenido: React.ReactNode) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, contenido });
  };
  const caja = tip && (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] shadow-lg"
      style={{ left: Math.min(tip.x + 12, (ref.current?.clientWidth ?? 300) - 190), top: Math.max(tip.y - 12, 0), minWidth: 150 }}
    >
      {tip.contenido}
    </div>
  );
  return { ref, mostrar, ocultar: () => setTip(null), caja };
}

const Muestra: React.FC<{ color: string; texto: string; forma?: 'cuadro' | 'linea' }> = ({ color, texto, forma = 'cuadro' }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
    {forma === 'cuadro' ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> : <span className="h-3 w-0.5" style={{ background: color }} />}
    {texto}
  </span>
);

const FilaTip: React.FC<{ color?: string; k: string; v: string }> = ({ color, k, v }) => (
  <div className="flex items-center justify-between gap-4 py-0.5">
    <span className="flex items-center gap-1.5 text-gray-500">{color && <span className="h-2 w-2 rounded-sm" style={{ background: color }} />}{k}</span>
    <b className="text-gray-900 tabular-nums">{v}</b>
  </div>
);

// ------------------------------------------------------------------ barras agrupadas por mes (genérico)
export interface SerieMes { clave: string; etiqueta: string; color: string }
export const BarrasMes: React.FC<{ datos: ({ mes: string } & Record<string, number | string>)[]; series: SerieMes[]; vacio: string; aria: string }> = ({ datos, series, vacio, aria }) => {
  const { ref, mostrar, ocultar, caja } = useTip();
  const [activo, setActivo] = useState<number | null>(null);
  const W = 720, H = 240, iz = 52, de = 8, ar = 12, ab = 28;
  const val = (d: (typeof datos)[number], k: string) => Number(d[k]) || 0;
  const { tope, pasos } = escala(Math.max(0, ...datos.flatMap((d) => series.map((s) => val(d, s.clave)))));
  const banda = (W - iz - de) / datos.length;
  const ancho = Math.min(18, (banda * 0.62 - (series.length - 1) * 2) / series.length);
  const y = (v: number) => ar + (H - ar - ab) * (1 - v / tope);
  if (!datos.some((d) => series.some((s) => val(d, s.clave)))) return <p className="py-12 text-center text-xs text-gray-400">{vacio}</p>;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => { ocultar(); setActivo(null); }}>
      {series.length > 1 && (
        <div className="mb-2 flex gap-4">{series.map((s) => <Muestra key={s.clave} color={s.color} texto={s.etiqueta} />)}</div>
      )}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px] h-auto" role="img" aria-label={aria}>
        {pasos.map((p) => (
          <g key={p}>
            <line x1={iz} x2={W - de} y1={y(p)} y2={y(p)} stroke={p === 0 ? C.eje : C.grid} strokeWidth={1} />
            <text x={iz - 8} y={y(p) + 3.5} textAnchor="end" fontSize={10} fill={C.muted} className="tabular-nums">{fmtCorto(p)}</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const x0 = iz + i * banda + (banda - (ancho * series.length + (series.length - 1) * 2)) / 2;
          return (
            <g key={d.mes}>
              {activo === i && <rect x={iz + i * banda} y={ar} width={banda} height={H - ar - ab} fill="#f3f3f0" />}
              {series.map((s, k) => (
                <path key={s.clave} d={barraV(x0 + k * (ancho + 2), y(val(d, s.clave)), ancho, y(0) - y(val(d, s.clave)))} fill={s.color} />
              ))}
              <text x={iz + i * banda + banda / 2} y={H - ab + 16} textAnchor="middle" fontSize={10} fill={activo === i ? C.tinta2 : C.muted}>
                {mesTxt(d.mes, i === 0 || d.mes.endsWith('-01'))}
              </text>
              {/* zona de hover más grande que la marca */}
              <rect x={iz + i * banda} y={ar} width={banda} height={H - ar - ab + 20} fill="transparent"
                onMouseMove={(e) => {
                  setActivo(i);
                  mostrar(e, (
                    <>
                      <div className="mb-1 font-bold text-gray-800 capitalize">{mesTxt(d.mes, true)}</div>
                      {series.map((s) => <FilaTip key={s.clave} color={s.color} k={s.etiqueta} v={fmtUSD(val(d, s.clave))} />)}
                    </>
                  ));
                }} />
            </g>
          );
        })}
      </svg>
      </div>
      {caja}
      <details className="mt-1 text-[11px] text-gray-500">
        <summary className="cursor-pointer select-none hover:text-gray-800">Ver datos en tabla</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead><tr className="text-left text-gray-400"><th className="py-1">Mes</th>{series.map((s) => <th key={s.clave} className="py-1 text-right">{s.etiqueta}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {datos.map((d) => (
              <tr key={d.mes}><td className="py-1 capitalize">{mesTxt(d.mes, true)}</td>{series.map((s) => <td key={s.clave} className="py-1 text-right">{fmtUSD(val(d, s.clave))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

/** Ejecutado (avances) vs. planillado al cliente, por mes. */
export const BarrasMensuales: React.FC<{ datos: { mes: string; ejecutado: number; planillado: number }[]; conPlanillado: boolean }> = ({ datos, conPlanillado }) => (
  <BarrasMes datos={datos} vacio="Aún no hay avances registrados en los últimos 12 meses." aria="Ejecutado y planillado por mes, últimos 12 meses"
    series={[{ clave: 'ejecutado', etiqueta: 'Ejecutado (avances)', color: C.s1 }, ...(conPlanillado ? [{ clave: 'planillado', etiqueta: 'Planillado al cliente', color: C.s2 }] : [])]} />
);

// ------------------------------------------------------------------ avance económico vs tiempo, por obra
export const AvanceObras: React.FC<{
  datos: { id: string; nombre: string; contratado: number; ejecutado: number; pct: number; pctTiempo: number | null }[];
  onAbrir: (id: string) => void;
}> = ({ datos, onAbrir }) => {
  const { ref, mostrar, ocultar, caja } = useTip();
  if (!datos.length) return <p className="py-12 text-center text-xs text-gray-400">No hay obras en ejecución con presupuesto.</p>;
  return (
    <div ref={ref} className="relative" onMouseLeave={ocultar}>
      <div className="mb-3 flex flex-wrap gap-4">
        <Muestra color={C.s1} texto="Avance económico" />
        <Muestra color="#0b0b0b" texto="Tiempo transcurrido" forma="linea" />
      </div>
      <ul className="space-y-3">
        {datos.map((o) => {
          const atrasada = o.pctTiempo != null && o.pctTiempo - o.pct > 0.1;
          const w = Math.min(o.pct, 1) * 100;
          return (
            <li key={o.id}>
              <button
                className="block w-full text-left"
                onClick={() => onAbrir(o.id)}
                onMouseMove={(e) => mostrar(e, (
                  <>
                    <div className="mb-1 max-w-[220px] truncate font-bold text-gray-800">{o.nombre}</div>
                    <FilaTip color={C.s1} k="Avance" v={pct(o.pct)} />
                    {o.pctTiempo != null && <FilaTip k="Tiempo transcurrido" v={pct(o.pctTiempo)} />}
                    <FilaTip k="Ejecutado" v={fmtUSD(o.ejecutado)} />
                    <FilaTip k="Contratado" v={fmtUSD(o.contratado)} />
                  </>
                ))}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-gray-800">{o.nombre}</span>
                  <span className="shrink-0 tabular-nums text-gray-600">
                    {atrasada && <span className="mr-2 font-semibold" style={{ color: C.critico }}><BsExclamationTriangleFill className="mr-1 inline" />Atrasada</span>}
                    {pct(o.pct)}
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full" style={{ background: C.pista }}>
                  <div className="absolute inset-y-0 left-0 rounded-r-[4px] rounded-l-full" style={{ width: `${w}%`, background: C.s1 }} />
                  {o.pctTiempo != null && (
                    <span className="absolute -top-1 h-[18px] w-0.5 rounded bg-gray-900 ring-2 ring-white" style={{ left: `calc(${o.pctTiempo * 100}% - 1px)` }} />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {caja}
    </div>
  );
};

// ------------------------------------------------------------------ obras por estado (barra segmentada)
export const BarraEstados: React.FC<{ datos: { clave: string; etiqueta: string; n: number; color: string }[] }> = ({ datos }) => {
  const { ref, mostrar, ocultar, caja } = useTip();
  const total = datos.reduce((s, d) => s + d.n, 0);
  if (!total) return <p className="py-6 text-center text-xs text-gray-400">Sin obras.</p>;
  const vis = datos.filter((d) => d.n > 0);
  return (
    <div ref={ref} className="relative" onMouseLeave={ocultar}>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {vis.map((d) => (
          <div key={d.clave} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(d.n / total) * 100}%`, background: d.color }}
            onMouseMove={(e) => mostrar(e, <FilaTip color={d.color} k={d.etiqueta} v={`${d.n} (${pct(d.n / total)})`} />)} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {datos.map((d) => (
          <li key={d.clave} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />{d.etiqueta}</span>
            <b className="tabular-nums text-gray-900">{d.n}</b>
          </li>
        ))}
      </ul>
      {caja}
    </div>
  );
};

// ------------------------------------------------------------------ barras horizontales (embudo / ranking)
export const BarrasH: React.FC<{
  datos: { clave: string; etiqueta: string; valor: number; detalle?: string; color: string }[];
  formato?: (v: number) => string;
  vacio: string;
}> = ({ datos, formato = fmtUSD, vacio }) => {
  const { ref, mostrar, ocultar, caja } = useTip();
  const max = Math.max(0, ...datos.map((d) => d.valor));
  if (!max) return <p className="py-8 text-center text-xs text-gray-400">{vacio}</p>;
  return (
    <div ref={ref} className="relative" onMouseLeave={ocultar}>
      <ul className="space-y-2.5">
        {datos.map((d) => (
          <li key={d.clave} onMouseMove={(e) => mostrar(e, <><FilaTip color={d.color} k={d.etiqueta} v={formato(d.valor)} />{d.detalle && <div className="text-gray-500">{d.detalle}</div>}</>)}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-gray-700">{d.etiqueta}</span>
              <span className="shrink-0 tabular-nums"><b className="text-gray-900">{formato(d.valor)}</b>{d.detalle && <span className="ml-1.5 text-gray-400">{d.detalle}</span>}</span>
            </div>
            <div className="h-2 w-full rounded-full" style={{ background: C.pista }}>
              <div className="h-full rounded-r-[4px] rounded-l-full" style={{ width: d.valor > 0 ? `${Math.max((d.valor / max) * 100, 1.5)}%` : 0, background: d.color }} />
            </div>
          </li>
        ))}
      </ul>
      {caja}
    </div>
  );
};

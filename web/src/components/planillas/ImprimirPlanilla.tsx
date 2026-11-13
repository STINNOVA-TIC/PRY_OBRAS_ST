import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BsPrinter } from 'react-icons/bs';
import { planillasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { Planilla } from '../../types';
import { FirmaImagen } from '../common/FirmaImagen';
import { fmtN } from '../ejecucion/comunes';
import { fmt2, fmtDia } from './comunes';

const usd = (n: number) => `$ ${fmt2(n)}`;

/**
 * Formato impreso de la planilla (A4 horizontal), como el PDF de la app anterior:
 * cabecera, líneas con cantidades y valores anterior/actual/acumulado, totales, firmas y anexo de memoria de cálculo.
 * Se imprime o se guarda como PDF desde el navegador.
 */
export const ImprimirPlanilla: React.FC = () => {
  const { obraId = '', id = '' } = useParams();
  const [p, setP] = useState<Planilla | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    planillasAPI.obtener(obraId, id).then(setP).catch((e) => setError(mensajeError(e)));
  }, [obraId, id]);

  useEffect(() => {
    if (p) document.title = `Planilla ${p.numero} - ${p.contratistaNombre ?? p.obraNombre}`;
  }, [p]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!p) return <div className="p-8 text-sm text-gray-500">Preparando planilla...</div>;

  const f = p.formato;
  const t = p.totales;
  const ctr = p.tipo === 'CONTRATISTA';
  const marca = ['BORRADOR', 'OBSERVADA'].includes(p.estado) ? 'BORRADOR' : p.estado === 'ANULADA' ? 'ANULADA' : p.estado === 'PRESENTADA' ? 'POR APROBAR' : null;
  const firmadas = p.firmas.filter((x) => x.firmado);
  const th = 'border border-gray-700 px-1 py-0.5 font-bold text-center';
  const td = 'border border-gray-700 px-1 py-0.5';

  return (
    <div className="hoja bg-white text-black text-[8.5pt] leading-tight">
      <style>{`
        @page { size: A4 landscape; margin: 10mm 10mm 12mm 10mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 7pt; } }
        @media print { .no-imprimir { display: none !important; } body { background: white; } }
        .hoja { font-family: Arial, Helvetica, sans-serif; max-width: 277mm; margin: 0 auto; position: relative; }
        .hoja table { border-collapse: collapse; width: 100%; }
        .hoja thead { display: table-header-group; }
        .hoja tr { page-break-inside: avoid; }
        .marca { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 80pt; font-weight: 900; color: rgba(0,0,0,0.06); transform: rotate(-20deg); pointer-events: none; }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 bg-gray-900 text-white flex items-center justify-between px-4 py-2 mb-4 text-xs">
        <span>Vista de impresión · A4 horizontal. Para PDF elige «Guardar como PDF» en el diálogo.</span>
        <button className="px-3 py-1.5 rounded bg-white text-gray-900 font-bold" onClick={() => window.print()}><BsPrinter className="inline mr-1.5" />Imprimir / PDF</button>
      </div>
      {marca && <div className="marca">{marca}</div>}

      <div className="px-2">
        <div className="text-center mb-2">
          <div className="text-[11pt] font-black uppercase">{ctr ? f.contratante : f.contratista}</div>
          <div className="text-[10pt] font-bold uppercase">Planilla de avance de obra N.º {p.numero}</div>
        </div>

        <table className="mb-2">
          <tbody>
            <tr>
              <td className={`${td} font-bold w-[13%]`}>PROYECTO:</td>
              <td className={td} colSpan={5}>{f.proyecto}</td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>CONTRATANTE:</td><td className={`${td} w-[30%]`}>{f.contratante}</td>
              <td className={`${td} font-bold w-[14%]`}>{ctr ? 'MONTO SUBCONTRATO:' : 'MONTO CONTRATO:'}</td><td className={`${td} text-right w-[12%]`}>{usd(t.montoContrato)}</td>
              <td className={`${td} font-bold w-[13%]`}>PLANILLA N.º:</td><td className={`${td} text-center font-bold`}>{p.numero}</td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>CONTRATISTA:</td><td className={td}>{f.contratista}</td>
              <td className={`${td} font-bold`}>MONTO PLANILLA:</td><td className={`${td} text-right font-bold`}>{usd(t.total)}</td>
              <td className={`${td} font-bold`}>PERÍODO:</td><td className={`${td} text-center`}>{fmtDia(p.periodoDesde)} al {fmtDia(p.periodoHasta)}</td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>FISCALIZACIÓN:</td><td className={td}>{f.fiscalizacion}</td>
              <td className={`${td} font-bold`}>MONTO ACUMULADO:</td><td className={`${td} text-right`}>{usd(t.acumulado)}</td>
              <td className={`${td} font-bold`}>FECHA DE INICIO:</td><td className={`${td} text-center`}>{fmtDia(p.obraInicio)}</td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>PROVINCIA:</td><td className={td}>{f.provincia}</td>
              <td className={`${td} font-bold`}>PLAZO:</td><td className={`${td} text-center`}>{f.plazo}{f.ampliacion ? ` (+ ${f.ampliacion})` : ''}</td>
              <td className={`${td} font-bold`}>FIN DE PLAZO:</td><td className={`${td} text-center`}>{fmtDia(p.obraFin)}</td>
            </tr>
            {f.descripcion && (
              <tr><td className={`${td} font-bold`}>DESCRIPCIÓN:</td><td className={td} colSpan={5}>{f.descripcion}</td></tr>
            )}
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th className={th} rowSpan={2}>N.º</th>
              <th className={th} rowSpan={2}>DESCRIPCIÓN</th>
              <th className={th} rowSpan={2}>UNID.</th>
              <th className={th} rowSpan={2}>CANTIDAD</th>
              <th className={th} rowSpan={2}>P. UNITARIO</th>
              <th className={th} rowSpan={2}>SUBTOTAL</th>
              <th className={th} colSpan={3}>CANTIDADES</th>
              <th className={th} colSpan={3}>VALORES</th>
              <th className={th} rowSpan={2}>% EJEC.</th>
            </tr>
            <tr>
              <th className={th}>ANTERIOR</th><th className={th}>ACTUAL</th><th className={th}>ACUMULADO</th>
              <th className={th}>ANTERIOR</th><th className={th}>ACTUAL</th><th className={th}>ACUMULADO</th>
            </tr>
          </thead>
          <tbody>
            {p.lineas.map((l, i) => (
              <tr key={l.obraRubroId}>
                <td className={`${td} text-center`}>{i + 1}</td>
                <td className={td}>{l.descripcion}</td>
                <td className={`${td} text-center`}>{l.unidad}</td>
                <td className={`${td} text-right`}>{fmt2(l.cantidadContrato)}</td>
                <td className={`${td} text-right`}>{fmtN(l.precioUnitario, 4)}</td>
                <td className={`${td} text-right`}>{fmt2(l.cantidadContrato * l.precioUnitario)}</td>
                <td className={`${td} text-right`}>{fmt2(l.cantidadAnterior)}</td>
                <td className={`${td} text-right font-bold`}>{fmt2(l.cantidadPeriodo)}</td>
                <td className={`${td} text-right`}>{fmt2(l.cantidadAcumulada)}</td>
                <td className={`${td} text-right`}>{fmt2(l.valorAnterior)}</td>
                <td className={`${td} text-right font-bold`}>{fmt2(l.subtotal)}</td>
                <td className={`${td} text-right`}>{fmt2(l.valorAcumulado)}</td>
                <td className={`${td} text-right`}>{l.pctEjecucion != null ? `${fmt2(l.pctEjecucion * 100)}%` : ''}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className={`${td} text-right`} colSpan={5}>TOTALES</td>
              <td className={`${td} text-right`}>{fmt2(t.montoContrato)}</td>
              <td className={td} colSpan={3} />
              <td className={`${td} text-right`}>{fmt2(t.anterior)}</td>
              <td className={`${td} text-right`}>{fmt2(t.subtotal)}</td>
              <td className={`${td} text-right`}>{fmt2(t.acumulado)}</td>
              <td className={`${td} text-right`}>{t.montoContrato > 0 ? `${fmt2((t.acumulado / t.montoContrato) * 100)}%` : ''}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end mt-2" style={{ pageBreakInside: 'avoid' }}>
          <table style={{ width: '42%' }}>
            <tbody>
              <tr><td className={`${td} font-bold`}>TOTAL SIN DESCUENTOS</td><td className={`${td} text-right`}>{usd(t.subtotal)}</td></tr>
              <tr><td className={`${td} font-bold`}>DESCUENTOS{p.multaDetalle ? ` (${p.multaDetalle})` : ''}</td><td className={`${td} text-right`}>{usd(t.multa)}</td></tr>
              <tr><td className={`${td} font-bold`}>TOTAL CON DESCUENTOS</td><td className={`${td} text-right`}>{usd(t.base)}</td></tr>
              <tr><td className={`${td} font-bold`}>IVA {fmtN(p.ivaPct)} %</td><td className={`${td} text-right`}>{usd(t.iva)}</td></tr>
              <tr><td className={`${td} font-black`}>TOTAL + IVA</td><td className={`${td} text-right font-black`}>{usd(t.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Firmas del formato */}
        <div className="grid gap-6 mt-14" style={{ gridTemplateColumns: `repeat(${Math.max(1, (f.firmas ?? []).length)}, minmax(0, 1fr))`, pageBreakInside: 'avoid' }}>
          {(f.firmas ?? []).map((x, k) => (
            <div key={k} className="text-center">
              <div className="border-t border-black pt-1 font-bold uppercase">{x.nombre || ' '}</div>
              <div className="uppercase">{x.cargo}</div>
              <div className="uppercase text-[7.5pt]">{x.entidad}</div>
            </div>
          ))}
        </div>

        {firmadas.length > 0 && (
          <div className="mt-6 border border-gray-400 p-2" style={{ pageBreakInside: 'avoid' }}>
            <div className="text-[7pt] font-bold uppercase mb-1">Control interno ST (firmas electrónicas)</div>
            <div className="flex gap-6">
              {firmadas.map((x) => (
                <div key={x.rol} className="text-center text-[7pt]">
                  <div className="h-10 flex items-end justify-center"><FirmaImagen archivoId={x.firmaArchivoId} className="max-h-10 object-contain" /></div>
                  <div className="font-bold uppercase">{x.nombreFirmante}</div>
                  <div>{x.etiqueta} · {x.firmadoEn ? new Date(x.firmadoEn).toLocaleString('es-EC') : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {f.anexo !== false && p.anexo.length > 0 && (
          <div style={{ pageBreakBefore: 'always' }}>
            <div className="text-center my-2">
              <div className="text-[10pt] font-bold uppercase">Anexo: memoria de cálculo · Planilla N.º {p.numero}</div>
              <div>{f.proyecto} · Período {fmtDia(p.periodoDesde)} al {fmtDia(p.periodoHasta)}</div>
            </div>
            <table>
              <thead>
                <tr>
                  {['FECHA', 'RUBRO', 'ABSC. DESDE', 'ABSC. HASTA', 'FRENTE / TRAMO', 'CANTIDAD', 'UNID.', ...(ctr ? [] : ['EJECUTÓ']), 'OBSERVACIÓN', 'REGISTRÓ'].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {p.anexo.map((a, k) => (
                  <tr key={k}>
                    <td className={`${td} text-center whitespace-nowrap`}>{fmtDia(a.fecha)}</td>
                    <td className={td}>{a.rubro}</td>
                    <td className={`${td} text-center`}>{a.abscisaDesde}</td>
                    <td className={`${td} text-center`}>{a.abscisaHasta}</td>
                    <td className={td}>{[a.frente, a.tramo].filter(Boolean).join(' / ')}</td>
                    <td className={`${td} text-right`}>{fmt2(a.cantidad)}</td>
                    <td className={`${td} text-center`}>{a.unidad}</td>
                    {!ctr && <td className={td}>{a.ejecutor}</td>}
                    <td className={td}>{a.nota}</td>
                    <td className={td}>{a.registradoPorNombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/** Columna esperada en un Excel de importación; `alias` son los encabezados aceptados (sin tildes ni signos). */
export interface ColumnaExcel {
  clave: string;
  alias: string[];
  requerida?: boolean;
}

export interface FilaLeida {
  /** N.º de fila en la hoja (para mostrar errores). */
  fila: number;
  valores: Record<string, string | number | null>;
}

/** «Descripción», «P. UNIT.», «precio unitario» → «DESCRIPCION», «PUNIT», «PRECIOUNITARIO». */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Valor legible de una celda (texto enriquecido, fórmulas, hipervínculos, fechas). */
function valorCelda(c: ExcelJS.Cell): string | number | null {
  const v = c.value as unknown;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.trim() || null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string; error?: string };
    if (o.richText) return o.richText.map((t) => t.text).join('').trim() || null;
    if (o.result !== undefined) return typeof o.result === 'number' ? o.result : o.result == null ? null : String(o.result).trim() || null;
    if (o.text) return String(o.text).trim() || null;
    if (o.error) return null;
  }
  return String(v).trim() || null;
}

/**
 * Lee la primera hoja que tenga los encabezados requeridos (busca en las primeras 30 filas)
 * y devuelve las filas de datos hasta 3 filas vacías seguidas. Ignora filas de totales sin datos clave.
 */
export async function leerTablaExcel(buffer: Buffer, columnas: ColumnaExcel[]): Promise<FilaLeida[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo: debe ser un Excel .xlsx');
  }
  const requeridas = columnas.filter((c) => c.requerida);
  for (const hoja of wb.worksheets) {
    for (let r = 1; r <= Math.min(30, hoja.rowCount); r++) {
      const fila = hoja.getRow(r);
      const mapa: Record<string, number> = {};
      fila.eachCell((celda, col) => {
        const t = valorCelda(celda);
        if (typeof t !== 'string') return;
        const n = normalizar(t);
        const c = columnas.find((x) => !(x.clave in mapa) && x.alias.some((a) => n === a || (a.length >= 5 && n.startsWith(a))));
        if (c) mapa[c.clave] = col;
      });
      if (!requeridas.every((c) => c.clave in mapa)) continue;

      const salida: FilaLeida[] = [];
      let vacias = 0;
      for (let i = r + 1; i <= hoja.rowCount && vacias < 3; i++) {
        const row = hoja.getRow(i);
        const valores: Record<string, string | number | null> = {};
        for (const c of columnas) valores[c.clave] = c.clave in mapa ? valorCelda(row.getCell(mapa[c.clave])) : null;
        if (requeridas.every((c) => valores[c.clave] == null)) {
          vacias++;
          continue;
        }
        vacias = 0;
        salida.push({ fila: i, valores });
      }
      if (salida.length > 2000) throw new BadRequestException('El archivo tiene más de 2000 filas');
      return salida;
    }
  }
  throw new BadRequestException(
    `No se encontraron los encabezados: ${requeridas.map((c) => c.alias[0]).join(', ')}. Revisa que la tabla tenga una fila de títulos.`,
  );
}

/**
 * Número desde Excel: acepta 12689.33, «12.689,33», «1.532», «462,88», «12,689.33», «$ 1.234,50».
 * Con punto y coma, el último separador es el decimal; con solo punto en grupos de 3, es separador de miles.
 */
export function numeroExcel(v: string | number | null): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = v.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const ultimoP = s.lastIndexOf('.');
  const ultimaC = s.lastIndexOf(',');
  if (ultimoP >= 0 && ultimaC >= 0) {
    s = ultimaC > ultimoP ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimaC >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** «UNIDAD», «und», «U.» → «u»; «M2», «m²» → «m2»; el resto en minúsculas tal cual (máx. 20). */
export function unidadExcel(v: string | number | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  const n = normalizar(t);
  if (['UNIDAD', 'UNIDADES', 'UND', 'UNID', 'U', 'UN'].includes(n)) return 'u';
  if (['M2', 'MT2', 'M²'].includes(n) || t === 'm²') return 'm2';
  if (['M3', 'MT3'].includes(n) || t === 'm³') return 'm3';
  if (['M', 'ML', 'MT', 'METRO', 'METROS'].includes(n)) return 'm';
  if (['KG', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'].includes(n)) return 'kg';
  if (['GL', 'GLOBAL'].includes(n)) return 'gl';
  return t.toLowerCase().slice(0, 20);
}

/** Genera un .xlsx de una hoja con encabezado en negrita, anchos y formato numérico. */
export type ColumnaSalida = { titulo: string; ancho?: number; numero?: boolean; decimales?: number };
export type HojaExcel = {
  nombre: string;
  columnas: ColumnaSalida[];
  filas: (string | number | null | undefined)[][];
  titulo?: string;
};

export async function generarExcel(
  nombreHoja: string,
  columnas: ColumnaSalida[],
  filas: (string | number | null | undefined)[][],
  titulo?: string,
): Promise<Buffer> {
  return generarExcelHojas([{ nombre: nombreHoja, columnas, filas, titulo }]);
}

/** Libro con varias hojas (mismo estilo: título, cabecera oscura, números con separador). */
export async function generarExcelHojas(hojas: HojaExcel[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ST-OBRAS';
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    if (h.titulo) {
      ws.addRow([h.titulo]).font = { bold: true, size: 13 };
      ws.addRow([]);
    }
    const cab = ws.addRow(h.columnas.map((c) => c.titulo));
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    for (const f of h.filas) ws.addRow(f.map((x) => (x === undefined ? null : x)));
    h.columnas.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.ancho ?? 16;
      if (c.numero) col.numFmt = c.decimales === 0 ? '#,##0' : c.decimales === 1 ? '0.0%' : '#,##0.00';
      if (!c.numero) col.alignment = { wrapText: true, vertical: 'top' };
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Archivo subido a un endpoint de importación: debe ser .xlsx (un ZIP: empieza con «PK»). */
export function exigirXlsx(archivo?: { buffer: Buffer; size: number }): Buffer {
  if (!archivo?.buffer?.length) throw new BadRequestException('Adjunta el archivo Excel en el campo «archivo»');
  if (archivo.size > 5 * 1024 * 1024) throw new BadRequestException('El Excel supera 5 MB');
  if (archivo.buffer[0] !== 0x50 || archivo.buffer[1] !== 0x4b)
    throw new BadRequestException('El archivo debe ser un Excel .xlsx (si es .xls, guárdalo como .xlsx)');
  return archivo.buffer;
}

export const LIMITE_EXCEL = { limits: { fileSize: 5 * 1024 * 1024, files: 1 } };

/** Columnas reconocidas en los Excel de rubros (presupuesto) y de materiales. */
export const COLS_RUBRO: ColumnaExcel[] = [
  { clave: 'codigo', alias: ['CODIGO', 'COD', 'CODIGORUBRO', 'ITEM'] },
  { clave: 'descripcion', alias: ['DESCRIPCION', 'DESCRIPCIONDELRUBRO', 'RUBRO', 'DETALLE', 'CONCEPTO'], requerida: true },
  { clave: 'unidad', alias: ['UNIDAD', 'UND', 'UNID', 'U'], requerida: true },
  { clave: 'cantidad', alias: ['CANTIDAD', 'CANT'] },
  { clave: 'precio', alias: ['PUNIT', 'PUNITARIO', 'PRECIOUNITARIO', 'PRECIOUNIT', 'PU', 'PRECIO', 'VALORUNITARIO', 'COSTOUNITARIO', 'PUREF'] },
];
export const COLS_MATERIAL: ColumnaExcel[] = [
  { clave: 'codigo', alias: ['CODIGO', 'COD', 'CODIGOMATERIAL'], requerida: true },
  { clave: 'descripcion', alias: ['DESCRIPCION', 'NOMBRE', 'MATERIAL', 'PRODUCTO', 'DETALLE'], requerida: true },
  { clave: 'unidad', alias: ['UNIDAD', 'UND', 'UNID', 'U'], requerida: true },
  { clave: 'cantidad', alias: ['CANTIDAD', 'CANT'] },
  { clave: 'costo', alias: ['COSTOUNITARIO', 'COSTO', 'PUNIT', 'PRECIOUNITARIO', 'PRECIO', 'PU', 'VALORUNITARIO'] },
  { clave: 'minimo', alias: ['STOCKMINIMO', 'MINIMO'] },
];

const texto = (v: string | number | null) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim() || null);

export interface FilaRubroExcel {
  fila: number;
  codigo: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number | null;
  precioUnitario: number | null;
  errores: string[];
}

/** Filas de totales al pie de una tabla («TOTAL», «SUBTOTAL», «IVA 15%»…) que no son datos. */
const esTotal = (desc: string | number | null, unidad: string | number | null) =>
  unidad == null && typeof desc === 'string' && /^(sub\s*)?total|^iva\b|^suman?\b|^valor total/i.test(desc.trim());

export function filasRubro(filas: FilaLeida[], exigirCantidad: boolean): FilaRubroExcel[] {
  return filas.filter(({ valores: v }) => !esTotal(v.descripcion, v.unidad)).map(({ fila, valores: v }) => {
    const r: FilaRubroExcel = {
      fila,
      codigo: texto(v.codigo)?.slice(0, 30) ?? null,
      descripcion: texto(v.descripcion),
      unidad: unidadExcel(v.unidad),
      cantidad: numeroExcel(v.cantidad),
      precioUnitario: numeroExcel(v.precio),
      errores: [],
    };
    if (!r.descripcion || r.descripcion.length < 3) r.errores.push('Falta la descripción');
    else if (r.descripcion.length > 300) r.errores.push('Descripción de más de 300 caracteres');
    if (!r.unidad) r.errores.push('Falta la unidad');
    if (exigirCantidad && (r.cantidad == null || r.cantidad < 0)) r.errores.push('Cantidad no válida');
    if (r.precioUnitario != null && r.precioUnitario < 0) r.errores.push('Precio negativo');
    return r;
  });
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
}

export function filasMaterial(filas: FilaLeida[], exigirCantidad: boolean): FilaMaterialExcel[] {
  return filas.filter(({ valores: v }) => !esTotal(v.descripcion, v.unidad) && !esTotal(v.codigo, v.unidad)).map(({ fila, valores: v }) => {
    const m: FilaMaterialExcel = {
      fila,
      codigo: texto(v.codigo)?.toUpperCase() ?? null,
      nombre: texto(v.descripcion),
      unidad: unidadExcel(v.unidad),
      cantidad: numeroExcel(v.cantidad),
      costoUnitario: numeroExcel(v.costo),
      stockMinimo: numeroExcel(v.minimo),
      errores: [],
    };
    if (!m.codigo) m.errores.push('Falta el código');
    else if (m.codigo.length > 20) m.errores.push('Código de más de 20 caracteres');
    if (!m.nombre) m.errores.push('Falta la descripción');
    else if (m.nombre.length > 150) m.nombre = m.nombre.slice(0, 150);
    if (!m.unidad) m.errores.push('Falta la unidad');
    if (exigirCantidad && (m.cantidad == null || m.cantidad <= 0)) m.errores.push('Cantidad no válida');
    if (m.costoUnitario != null && m.costoUnitario < 0) m.errores.push('Costo negativo');
    return m;
  });
}

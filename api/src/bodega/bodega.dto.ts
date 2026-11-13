import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { PaginacionDto } from '../common/paginacion.dto.js';

export const TIPOS_MANUALES = ['INGRESO', 'CONSUMO', 'DEVOLUCION', 'AJUSTE'] as const;
export type TipoManual = (typeof TIPOS_MANUALES)[number];

/** Movimiento manual de bodega. La cantidad va siempre positiva salvo en AJUSTE (+ entra / − sale). */
export class MovimientoDto {
  @IsIn(TIPOS_MANUALES)
  tipo!: TipoManual;

  @IsInt()
  @Min(1)
  materialId!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @NotEquals(0)
  @Min(-1e9)
  @Max(1e9)
  cantidad!: number;

  @IsDateString({ strict: true })
  fecha!: string;

  /** N.º de guía de remisión, factura o vale. */
  @IsOptional() @IsString() @MaxLength(60) documentoRef?: string | null;

  /** Guía o respaldo (subido antes con POST /archivos). */
  @IsOptional() @IsUUID() archivoId?: string | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) costoUnitario?: number | null;

  /** Rubro en que se usó (solo consumos). */
  @IsOptional() @IsUUID() obraRubroId?: string | null;

  @IsOptional() @IsString() @MaxLength(1000) nota?: string | null;
}

export class RevertirDto {
  @IsString()
  @Length(5, 500)
  motivo!: string;
}

export class ListarMovimientosDto extends PaginacionDto {
  @IsOptional() @Type(() => Number) @IsInt() materialId?: number;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsDateString({ strict: true }) desde?: string;
  @IsOptional() @IsDateString({ strict: true }) hasta?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  override limit = 50;
}

// ---------------------------------------------------------------- transferencias
export class ItemTransferenciaDto {
  @IsInt() @Min(1) materialId!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) cantidad!: number;
}

/** Ítem al despachar o recibir: cantidad y, opcionales, una observación y una foto/documento (subido antes en /archivos). */
export class ItemMovimientoTransferenciaDto extends ItemTransferenciaDto {
  @IsOptional() @IsString() @MaxLength(500) nota?: string | null;
  @IsOptional() @IsUUID() archivoId?: string | null;
}

export class ItemRechazoDto {
  @IsInt() @Min(1) materialId!: number;
  @IsOptional() @IsString() @MaxLength(500) nota?: string | null;
  @IsOptional() @IsUUID() archivoId?: string | null;
}

export class RechazarTransferenciaDto {
  @IsString()
  @Length(5, 500)
  motivo!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemRechazoDto)
  items?: ItemRechazoDto[];
}

export class SolicitarTransferenciaDto {
  @IsInt() @Min(1) bodegaOrigenId!: number;
  @IsInt() @Min(1) bodegaDestinoId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemTransferenciaDto)
  items!: ItemTransferenciaDto[];

  @IsOptional() @IsString() @MaxLength(1000) motivo?: string | null;
}

export class DespacharDto {
  /** Cantidades despachadas (por defecto, lo solicitado). Puede ser menor o 0. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemMovimientoTransferenciaDto)
  items?: ItemMovimientoTransferenciaDto[];

  @IsOptional() @IsString() @MaxLength(60) documentoRef?: string | null;
}

export class RecibirDto {
  /** Cantidades recibidas (por defecto, lo despachado). Menos de lo despachado exige nota. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemMovimientoTransferenciaDto)
  items?: ItemMovimientoTransferenciaDto[];

  @IsOptional() @IsString() @MaxLength(1000) nota?: string | null;
}

export class AnularTransferenciaDto {
  @IsString()
  @Length(5, 500)
  motivo!: string;
}

export class ListarTransferenciasDto {
  @IsOptional() @Type(() => Number) @IsInt() bodegaId?: number;
  @IsOptional() @IsIn(['SOLICITADA', 'APROBADA', 'DESPACHADA', 'RECIBIDA', 'ANULADA', 'RECHAZADA', 'ABIERTAS']) estado?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class FilaIngresoDto {
  @IsString() @Length(1, 20) codigo!: string;
  @IsString() @Length(2, 150) nombre!: string;
  @IsString() @Length(1, 20) unidad!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) costoUnitario?: number | null;
}

/** Ingreso masivo desde Excel (CODIGO, DESCRIPCIÓN, UNIDAD, CANTIDAD): crea los materiales que falten. */
export class ImportarIngresoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FilaIngresoDto)
  filas!: FilaIngresoDto[];

  @IsDateString({ strict: true })
  fecha!: string;

  @IsOptional() @IsString() @MaxLength(60) documentoRef?: string | null;
  @IsOptional() @IsUUID() archivoId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) nota?: string | null;
}

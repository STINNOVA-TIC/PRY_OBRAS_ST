import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

export const CLASES_RUBRO = ['TERMO', 'TACHAS', 'NINGUNA'] as const;
export type ClaseRubro = (typeof CLASES_RUBRO)[number];

export class InsumoDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  /** Material que consume una unidad del rubro (según el APU). */
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  cantidadPorUnidad!: number;
}

export class RubroDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigo?: string | null;

  @IsString()
  @Length(3, 300)
  descripcion!: string;

  @IsString()
  @Length(1, 20)
  unidad!: string;

  /** Cantidad contractual. */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidad!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioUnitario!: number;

  /** null = automática (reconoce «termo» o «tacha» en la descripción). */
  @IsOptional()
  @IsIn(CLASES_RUBRO)
  clase?: ClaseRubro | null;

  /** Ancho de línea en cm (null = el escrito en la descripción o 15). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(500)
  anchoCm?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InsumoDto)
  insumos?: InsumoDto[];
}

/** Edición parcial: los campos ausentes no cambian; `insumos` reemplaza la lista completa. */
export class ActualizarRubroDto {
  @IsOptional() @IsString() @MaxLength(30) codigo?: string | null;
  @IsOptional() @IsString() @Length(3, 300) descripcion?: string;
  @IsOptional() @IsString() @Length(1, 20) unidad?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) cantidad?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) precioUnitario?: number;
  @IsOptional() @IsIn(CLASES_RUBRO) clase?: ClaseRubro | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(500) anchoCm?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InsumoDto)
  insumos?: InsumoDto[];
}

export class ItemCatalogoDto {
  @IsInt()
  @Min(1)
  catalogoRubroId!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidad!: number;

  /** Si se omite se usa el precio de referencia del catálogo. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioUnitario?: number;
}

export class DesdeCatalogoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ItemCatalogoDto)
  items!: ItemCatalogoDto[];
}

export class OrdenRubrosDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class FilaImportRubroDto {
  @IsOptional() @IsString() @MaxLength(30) codigo?: string | null;
  @IsString() @Length(3, 300) descripcion!: string;
  @IsString() @Length(1, 20) unidad!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) cantidad!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) precioUnitario?: number | null;
}

export class ImportarRubrosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => FilaImportRubroDto)
  filas!: FilaImportRubroDto[];
}

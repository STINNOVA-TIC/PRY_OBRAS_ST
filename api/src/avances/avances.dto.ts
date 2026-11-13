import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../common/paginacion.dto.js';

/** Abscisa vial: «94+131», «96+040.5» o un número de metros. */
const ABSCISA = /^(\d{1,4}\+\d{1,3}([.,]\d+)?|\d+([.,]\d+)?)$/;

export class AvanceDto {
  @IsUUID()
  obraRubroId!: string;

  @IsDateString({ strict: true })
  fecha!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  /** null = ejecutado por personal propio (ST). */
  @IsOptional()
  @IsUUID()
  obraContratistaId?: string | null;

  @IsOptional() @IsString() @MaxLength(100) frente?: string | null;
  @IsOptional() @IsString() @MaxLength(100) tramo?: string | null;

  @IsOptional()
  @Matches(ABSCISA, { message: 'Abscisa no válida (ej. 94+131)' })
  abscisaDesde?: string | null;

  @IsOptional()
  @Matches(ABSCISA, { message: 'Abscisa no válida (ej. 96+040)' })
  abscisaHasta?: string | null;

  @IsOptional() @IsIn(['BLANCO', 'AMARILLO']) color?: string | null;
  @IsOptional() @IsIn(['CONTINUA', 'SEGMENTADA']) tipoLinea?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  numLineas?: number | null;

  @IsOptional() @IsString() @MaxLength(1000) nota?: string | null;

  /** Fotos o PDF de respaldo (subidos antes con POST /archivos). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUUID('all', { each: true })
  evidencias?: string[];
}

export class AnularAvanceDto {
  @IsString()
  @Length(5, 500)
  motivo!: string;
}

export class ListarAvancesDto extends PaginacionDto {
  @IsOptional() @IsUUID() rubroId?: string;
  /** 'ST' = personal propio; o el id de obra_contratista. */
  @IsOptional() @IsString() contratista?: string;
  @IsOptional() @IsDateString({ strict: true }) desde?: string;
  @IsOptional() @IsDateString({ strict: true }) hasta?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  incluirAnulados?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  override limit = 50;
}

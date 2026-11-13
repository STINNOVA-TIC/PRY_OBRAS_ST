import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FirmaFormatoDto {
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(120) cargo?: string;
  @IsOptional() @IsString() @MaxLength(160) entidad?: string;
}

/** Datos que se imprimen en la cabecera y el pie de la planilla. */
export class FormatoDto {
  @IsOptional() @IsString() @MaxLength(300) proyecto?: string;
  @IsOptional() @IsString() @MaxLength(100) provincia?: string;
  @IsOptional() @IsString() @MaxLength(60) plazo?: string;
  @IsOptional() @IsString() @MaxLength(200) contratante?: string;
  @IsOptional() @IsString() @MaxLength(200) contratista?: string;
  @IsOptional() @IsString() @MaxLength(200) fiscalizacion?: string;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
  @IsOptional() @IsString() @MaxLength(200) ampliacion?: string;
  /** Incluir el anexo «memoria de cálculo» con los avances del período. */
  @IsOptional() @IsBoolean() anexo?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => FirmaFormatoDto)
  firmas?: FirmaFormatoDto[];
}

export class LineaPlanillaDto {
  @IsUUID()
  obraRubroId!: string;

  /** Lo que se cobra en el período (por defecto, lo registrado en la app). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1e11)
  cantidadPeriodo?: number;

  /** Solo planillas de contratista: precio del subcontrato. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1e9)
  precioUnitario?: number;

  /** Solo la primera planilla: lo ya planillado fuera de la app. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1e11)
  cantidadAnterior?: number;
}

class CamposPlanillaDto {
  /** Solo la primera planilla de la serie puede fijar el inicio; las demás siguen a la anterior. */
  @IsOptional() @IsDateString({ strict: true }) periodoDesde?: string;
  @IsOptional() @IsDateString({ strict: true }) periodoHasta?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1e11) multa?: number;
  @IsOptional() @IsString() @MaxLength(300) multaDetalle?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) observacion?: string | null;

  @IsOptional() @ValidateNested() @Type(() => FormatoDto) formato?: FormatoDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LineaPlanillaDto)
  lineas?: LineaPlanillaDto[];
}

export class CrearPlanillaDto extends CamposPlanillaDto {
  @IsIn(['CLIENTE', 'CONTRATISTA'])
  tipo!: 'CLIENTE' | 'CONTRATISTA';

  @IsOptional()
  @IsUUID()
  obraContratistaId?: string;
}

export class ActualizarPlanillaDto extends CamposPlanillaDto {}

export class PropuestaDto {
  @IsIn(['CLIENTE', 'CONTRATISTA'])
  tipo!: 'CLIENTE' | 'CONTRATISTA';

  @IsOptional() @IsUUID() obraContratistaId?: string;
  @IsOptional() @IsDateString({ strict: true }) periodoHasta?: string;
}

export class MotivoDto {
  @IsString()
  @MinLength(5, { message: 'Explica el motivo (mínimo 5 caracteres)' })
  @MaxLength(1000)
  motivo!: string;
}

export class PagarDto {
  @IsDateString({ strict: true }) fecha!: string;
  @IsOptional() @IsString() @MaxLength(100) referencia?: string;
}

export class ArchivoPlanillaDto {
  /** Planilla firmada escaneada (subida antes en /archivos). null la quita. */
  @IsOptional() @IsUUID() archivoId?: string | null;
}

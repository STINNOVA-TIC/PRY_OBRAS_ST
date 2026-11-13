import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const vacioANull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

/** Carga o actualización de un requisito administrativo (precios MTK, cotización, contrato, anticipo). */
export class RequisitoDto {
  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @Transform(recortar)
  @IsString()
  @Length(1, 150)
  referencia?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  fecha?: string | null;

  /** Solo para el anticipo (USD) */
  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto?: number | null;

  /** id devuelto por POST /archivos */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  archivoId?: string | null;

  /** "Confirmo que..." */
  @IsOptional()
  @IsBoolean()
  confirmado?: boolean;
}

export class RevisionRequisitoDto {
  /** true = dar OK · false = quitar OK */
  @IsBoolean()
  ok: boolean;
}

export class AgregarContratistaDto {
  @IsUUID()
  contratistaId: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 300)
  objeto?: string;
}

export class DocumentoContratistaDto {
  @IsUUID()
  archivoId: string;

  /** Obligatoria para documentos que vencen (IESS, SRI, pólizas) */
  @IsOptional()
  @IsDateString()
  vence?: string;
}

export class RevisionDocumentoDto {
  @IsIn(['APROBADO', 'RECHAZADO'])
  estado: 'APROBADO' | 'RECHAZADO';

  /** Obligatoria al rechazar */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(3, 500)
  observacion?: string;
}

export class FirmarHabilitacionDto {
  /** Paso a firmar; si no se envía, se usa el que corresponde al usuario designado. */
  @IsOptional()
  @IsIn(['ADMINISTRADOR', 'SUPERINTENDENTE'])
  rol?: 'ADMINISTRADOR' | 'SUPERINTENDENTE';
}

export class ReemplazoDto {
  @Transform(recortar)
  @IsString()
  @Length(5, 500, {
    message: 'Indica el motivo del reemplazo (mínimo 5 caracteres)',
  })
  motivo: string;
}

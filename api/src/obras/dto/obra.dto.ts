import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const vacioANull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export const ESTADOS_OBRA = [
  'HABILITACION',
  'ACTIVA',
  'PAUSADA',
  'CERRADA',
] as const;
export const FUNCIONES_OBRA = [
  'ADMINISTRADOR',
  'SUPERINTENDENTE',
  'RESIDENTE',
  'BODEGUERO',
  'VISUALIZADOR',
] as const;

export class CrearObraDto {
  @Transform(recortar)
  @IsString()
  @Length(2, 200)
  nombre: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 30)
  codigo?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 200)
  cliente?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 200)
  ubicacion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 100)
  provincia?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 60)
  plazoTexto?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}

/** Todos opcionales; null borra el valor. */
export class ActualizarObraDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(2, 200)
  nombre?: string;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 30)
  codigo?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 200)
  cliente?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 200)
  ubicacion?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 100)
  provincia?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 60)
  plazoTexto?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  fechaInicio?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  fechaFin?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  diasLaborablesSemana?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  ventanaRitmoDias?: number;
}

export class ListarObrasDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(ESTADOS_OBRA)
  estado?: (typeof ESTADOS_OBRA)[number];
}

export class MiembroDto {
  @IsIn(FUNCIONES_OBRA, {
    message: `funcion debe ser una de: ${FUNCIONES_OBRA.join(', ')}`,
  })
  funcion: (typeof FUNCIONES_OBRA)[number];
}

/** Firmantes de la habilitación (como aprobador/receptor designados en el POS). null para quitar. */
export class FirmantesDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  administradorId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  superintendenteId?: string | null;
}

export class CambiarEstadoDto {
  @IsIn(['ACTIVA', 'PAUSADA', 'CERRADA'])
  estado: 'ACTIVA' | 'PAUSADA' | 'CERRADA';

  @Transform(recortar)
  @IsString()
  @Length(5, 500, { message: 'Indica el motivo (mínimo 5 caracteres)' })
  motivo: string;
}

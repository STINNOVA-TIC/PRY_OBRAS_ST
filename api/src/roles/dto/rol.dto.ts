import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const aBooleano = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === true || value === 'true';

export class CrearRolDto {
  /** Código en MAYÚSCULAS y guion bajo, ej: JEFE_OBRA */
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, {
    message:
      'codigo debe estar en MAYÚSCULAS (A-Z, 0-9, _), máximo 40 caracteres',
  })
  codigo: string;

  @IsString()
  @Length(2, 80)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  esExterno?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  permisoIds?: number[];
}

/** El código no se edita: el sistema lo usa como identificador. */
export class ActualizarRolDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @IsBoolean()
  esExterno?: boolean;
}

export class AsignarPermisosRolDto {
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  permisoIds: number[];
}

export class ListarRolesDto {
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  incluirInactivos?: boolean;
}

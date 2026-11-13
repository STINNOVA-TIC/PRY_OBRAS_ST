import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { PaginacionDto } from '../../common/paginacion.dto.js';
import { PASSWORD_MENSAJE, PASSWORD_REGEX } from '../../common/password.js';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const aMinusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const aBooleano = ({ value }: { value: unknown }) =>
  value === undefined || value === ''
    ? undefined
    : value === true || value === 'true';

export class CrearUsuarioDto {
  @Transform(recortar)
  @IsString()
  @Length(2, 120)
  nombre: string;

  @Transform(aMinusculas)
  @IsEmail({}, { message: 'email no es válido' })
  @Length(5, 150)
  email: string;

  /** Se imprime bajo la firma en los documentos */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(2, 120)
  cargo?: string;

  @IsOptional()
  @IsString()
  @Length(5, 30)
  telefono?: string;

  /** Si no se envía, se genera una contraseña temporal y se devuelve una sola vez. */
  @IsOptional()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MENSAJE })
  password?: string;

  @IsOptional()
  @Matches(/^\d{10}(\d{3})?$/, {
    message: 'cedula debe tener 10 dígitos (o 13 si es RUC)',
  })
  cedula?: string;

  @IsOptional()
  @IsUUID()
  contratistaId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  rolIds?: number[];
}

export class ActualizarUsuarioDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(2, 120)
  nombre?: string;

  @IsOptional()
  @Transform(aMinusculas)
  @IsEmail({}, { message: 'email no es válido' })
  @Length(5, 150)
  email?: string;

  /** null para borrarla */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{10}(\d{3})?$/, {
    message: 'cedula debe tener 10 dígitos (o 13 si es RUC)',
  })
  cedula?: string | null;

  /** null para desvincularlo del contratista */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  contratistaId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(recortar)
  @IsString()
  @Length(2, 120)
  cargo?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(5, 30)
  telefono?: string | null;
}

export class ListarUsuariosDto extends PaginacionDto {
  /** Busca en nombre, email y cédula */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rolId?: number;
}

export class AsignarRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  rolIds: number[];
}

/** Reemplaza todas las excepciones del usuario. Un permiso no puede estar en ambas listas. */
export class ExcepcionesPermisosDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  conceder: number[];

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  denegar: number[];
}

export class ResetPasswordDto {
  /** Si no se envía, se genera una temporal y se devuelve en la respuesta. */
  @IsOptional()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MENSAJE })
  password?: string;
}

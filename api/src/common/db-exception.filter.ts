import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

interface PgError {
  code?: string;
  constraint?: string;
  message?: string;
}

/** Mensajes legibles para restricciones únicas conocidas. */
const MENSAJES_UNICOS: Record<string, string> = {
  ux_usuarios_email: 'El email ya está registrado',
  ux_usuarios_cedula: 'La cédula ya está registrada',
  roles_codigo_key: 'Ya existe un rol con ese código',
};

/**
 * Traduce errores de PostgreSQL a respuestas HTTP:
 *  23505 único → 409 · 23503 FK → 400 · P0001 (RAISE en triggers) → 400.
 */
@Catch(QueryFailedError)
export class DbExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DbExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const pg = exception.driverError as PgError;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno de base de datos';

    switch (pg.code) {
      case '23505':
        status = HttpStatus.CONFLICT;
        message =
          MENSAJES_UNICOS[pg.constraint ?? ''] ??
          'Ya existe un registro con esos datos';
        break;
      case '23503':
        status = HttpStatus.BAD_REQUEST;
        message = 'Referencia a un registro que no existe';
        break;
      case '23514':
        status = HttpStatus.BAD_REQUEST;
        message = 'Los datos no cumplen las reglas de la base de datos';
        break;
      case '42703': // columna inexistente
      case '42P01': // tabla inexistente
        message = 'La base de datos está desactualizada: reinicia la API para que aplique las migraciones';
        this.logger.error(exception.message, exception.stack);
        break;
      case 'P0001':
        status = HttpStatus.BAD_REQUEST;
        message = pg.message ?? message;
        break;
      default:
        this.logger.error(exception.message, exception.stack);
    }

    res.status(status).json({ statusCode: status, message });
  }
}

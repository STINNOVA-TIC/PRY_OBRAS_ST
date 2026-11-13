import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators.js';

/** GET /api/health → lo usa el healthcheck de Docker. Verifica también la conexión a la BD. */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DataSource) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'sin conexión',
      });
    }
  }
}

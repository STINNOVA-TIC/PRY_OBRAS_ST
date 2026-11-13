import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { ProgramaDto, ProgramaService } from './programa.service.js';

@Controller('obras/:obraId/programa')
export class ProgramaController {
  constructor(private readonly service: ProgramaService) {}

  /** Programa calculado: Gantt, producción diaria requerida, alertas y necesidad de material. */
  @Get()
  @Permisos('obras.ver')
  obtener(@Param('obraId', ParseUUIDPipe) obraId: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.obtener(yo, obraId);
  }

  /** Días de trabajo, ventana del ritmo, cobertura, entrega, fechas y rendimiento por rubro, stock mínimo. */
  @Put()
  @Permisos('rubros.editar')
  guardar(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: ProgramaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.guardar(yo, obraId, dto);
  }
}

@Module({ controllers: [ProgramaController], providers: [ProgramaService] })
export class ProgramaModule {}

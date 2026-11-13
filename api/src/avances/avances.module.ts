import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { AnularAvanceDto, AvanceDto, ListarAvancesDto } from './avances.dto.js';
import { AvancesService } from './avances.service.js';

@Controller('obras/:obraId/avances')
export class AvancesController {
  constructor(private readonly service: AvancesService) {}

  /** Avances (más recientes primero) con filtros por rubro, contratista y fechas; incluye sumas. */
  @Get()
  @Permisos('obras.ver')
  listar(@Param('obraId', ParseUUIDPipe) obraId: string, @Query() f: ListarAvancesDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.listar(yo, obraId, f);
  }

  /** Solo con la obra en ejecución. Devuelve el avance y el saldo actualizado del rubro. */
  @Post()
  @Permisos('avances.registrar')
  registrar(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: AvanceDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.registrar(yo, obraId, dto);
  }

  /** Anula con motivo (no se borra). Quien lo registró, o quien tenga avances.anular. */
  @Post(':id/anular')
  @HttpCode(200)
  @Permisos('obras.ver')
  anular(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularAvanceDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.anular(yo, obraId, id, dto);
  }
}

@Module({ controllers: [AvancesController], providers: [AvancesService] })
export class AvancesModule {}
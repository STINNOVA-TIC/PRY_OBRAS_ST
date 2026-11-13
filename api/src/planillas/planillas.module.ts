import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { MIME_XLSX } from '../common/excel.js';
import {
  ActualizarPlanillaDto,
  ArchivoPlanillaDto,
  CrearPlanillaDto,
  MotivoDto,
  PagarDto,
  PropuestaDto,
} from './planillas.dto.js';
import { PlanillasService } from './planillas.service.js';

@Controller('obras/:obraId/planillas')
export class PlanillasController {
  constructor(private readonly service: PlanillasService) {}

  /** Indicadores (cliente y contratistas) y lista de planillas de la obra. */
  @Get()
  @Permisos('planillas.ver')
  resumen(@Param('obraId', ParseUUIDPipe) obraId: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.resumen(yo, obraId);
  }

  /** Cómo sería la siguiente planilla de la serie (no guarda nada). */
  @Get('propuesta')
  @Permisos('planillas.ver')
  propuesta(@Param('obraId', ParseUUIDPipe) obraId: string, @Query() dto: PropuestaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.propuesta(yo, obraId, dto);
  }

  @Post()
  @Permisos('planillas.elaborar')
  crear(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: CrearPlanillaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.crear(yo, obraId, dto);
  }

  @Get(':id')
  @Permisos('planillas.ver')
  obtener(@Param('obraId', ParseUUIDPipe) obraId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.obtener(yo, obraId, id);
  }

  @Get(':id/exportar')
  @Permisos('planillas.ver')
  async exportar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() yo: UsuarioSesion,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, nombre } = await this.service.exportar(yo, obraId, id);
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }

  @Patch(':id')
  @Permisos('planillas.elaborar')
  actualizar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPlanillaDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.actualizar(yo, obraId, id, dto);
  }

  @Delete(':id')
  @Permisos('planillas.elaborar')
  eliminar(@Param('obraId', ParseUUIDPipe) obraId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.eliminar(yo, obraId, id);
  }

  /** Firma «Elaborado por» y pasa a revisión/aprobación. */
  @Post(':id/presentar')
  @HttpCode(200)
  @Permisos('planillas.elaborar')
  presentar(@Param('obraId', ParseUUIDPipe) obraId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.presentar(yo, obraId, id);
  }

  /** Firma el siguiente paso designado al usuario (Revisado / Aprobado). */
  @Post(':id/firmar')
  @HttpCode(200)
  @Permisos('planillas.firmar')
  firmar(@Param('obraId', ParseUUIDPipe) obraId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.firmar(yo, obraId, id);
  }

  /** Devuelve para corregir; quién puede se valida en el servicio. */
  @Post(':id/observar')
  @HttpCode(200)
  @Permisos('planillas.ver')
  observar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.observar(yo, obraId, id, dto);
  }

  @Post(':id/pagar')
  @HttpCode(200)
  @Permisos('planillas.estado')
  pagar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PagarDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.pagar(yo, obraId, id, dto);
  }

  @Post(':id/anular')
  @HttpCode(200)
  @Permisos('planillas.estado')
  anular(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.anular(yo, obraId, id, dto);
  }

  /** Planilla firmada escaneada. */
  @Put(':id/archivo')
  @Permisos('planillas.ver')
  adjuntar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchivoPlanillaDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.adjuntar(yo, obraId, id, dto);
  }
}

@Module({ controllers: [PlanillasController], providers: [PlanillasService], exports: [PlanillasService] })
export class PlanillasModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { COLS_RUBRO, LIMITE_EXCEL, MIME_XLSX, exigirXlsx, filasRubro, leerTablaExcel } from '../common/excel.js';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { ActualizarRubroDto, DesdeCatalogoDto, ImportarRubrosDto, OrdenRubrosDto, RubroDto } from './rubros.dto.js';
import { RubrosService } from './rubros.service.js';

@Controller('obras/:obraId/rubros')
export class RubrosController {
  constructor(private readonly service: RubrosService) {}

  /** Rubros con insumos, ejecutado, %, montos y saldo; más los totales de la obra. */
  @Get()
  @Permisos('obras.ver')
  listar(@Param('obraId', ParseUUIDPipe) obraId: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.listar(yo, obraId);
  }

  @Post()
  @Permisos('rubros.editar')
  crear(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: RubroDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.crear(yo, obraId, dto);
  }

  /** Copia rubros del catálogo (con insumos y clase) indicando la cantidad de esta obra. */
  @Post('desde-catalogo')
  @Permisos('rubros.editar')
  desdeCatalogo(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: DesdeCatalogoDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.desdeCatalogo(yo, obraId, dto);
  }

  /** Descarga los rubros con su avance en Excel. */
  @Get('exportar')
  @Permisos('obras.ver')
  async exportar(@Param('obraId', ParseUUIDPipe) obraId: string, @CurrentUser() yo: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    const { nombre, buffer } = await this.service.exportar(yo, obraId);
    const archivo = `rubros-${nombre.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}.xlsx`;
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${archivo}"` });
    return new StreamableFile(buffer);
  }

  /** Lee un Excel de presupuesto (DESCRIPCIÓN, UNIDAD, CANTIDAD, P. UNIT; CÓDIGO opcional) y devuelve las filas a revisar. No guarda. */
  @Post('importar/leer')
  @Permisos('rubros.editar')
  @UseInterceptors(FileInterceptor('archivo', LIMITE_EXCEL))
  async leer(@Param('obraId', ParseUUIDPipe) obraId: string, @UploadedFile() archivo: { buffer: Buffer; size: number }, @CurrentUser() yo: UsuarioSesion) {
    const filas = filasRubro(await leerTablaExcel(exigirXlsx(archivo), COLS_RUBRO), true);
    return { filas: await this.service.marcarDuplicados(yo, obraId, filas) };
  }

  /** Crea los rubros revisados (omite los que ya existen en la obra). */
  @Post('importar')
  @Permisos('rubros.editar')
  importar(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: ImportarRubrosDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.importar(yo, obraId, dto.filas);
  }

  /** Reordena: recibe todos los ids de rubros de la obra en el orden deseado. */
  @Put('orden')
  @Permisos('rubros.editar')
  ordenar(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() dto: OrdenRubrosDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.ordenar(yo, obraId, dto.ids);
  }

  @Patch(':id')
  @Permisos('rubros.editar')
  actualizar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarRubroDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.actualizar(yo, obraId, id, dto);
  }

  @Delete(':id')
  @Permisos('rubros.editar')
  eliminar(@Param('obraId', ParseUUIDPipe) obraId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.eliminar(yo, obraId, id);
  }
}

@Module({ controllers: [RubrosController], providers: [RubrosService], exports: [RubrosService] })
export class RubrosModule {}

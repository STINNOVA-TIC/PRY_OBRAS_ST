import { PlanillasModule } from '../planillas/planillas.module.js';
import { PlanillasService } from '../planillas/planillas.service.js';
import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { COLS_MATERIAL, LIMITE_EXCEL, exigirXlsx, filasMaterial, leerTablaExcel } from '../common/excel.js';
import { CurrentUser, Permisos, type UsuarioSesion } from '../common/decorators.js';
import { HabilitacionModule } from '../habilitacion/habilitacion.controller.js';
import { HabilitacionService } from '../habilitacion/habilitacion.service.js';
import {
  AnularTransferenciaDto,
  RechazarTransferenciaDto,
  DespacharDto,
  ImportarIngresoDto,
  ListarMovimientosDto,
  ListarTransferenciasDto,
  MovimientoDto,
  RecibirDto,
  RevertirDto,
  SolicitarTransferenciaDto,
} from './bodega.dto.js';
import { BodegaService } from './bodega.service.js';
import { TransferenciasService } from './transferencias.service.js';

@Controller('bodegas')
export class BodegasController {
  constructor(private readonly service: BodegaService) {}

  /** Bodega central (si la operas) y las de tus obras, con resumen. */
  @Get()
  @Permisos('bodega.ver')
  listar(@CurrentUser() yo: UsuarioSesion) {
    return this.service.listar(yo);
  }

  /** Existencias; en obra con requerido por contrato, pendiente por ingresar y control de consumo. */
  @Get(':id/stock')
  @Permisos('bodega.ver')
  stock(@Param('id', ParseIntPipe) id: number, @CurrentUser() yo: UsuarioSesion) {
    return this.service.stock(yo, id);
  }

  /** De dónde salen «Requerido» y «Avances» de un material en la bodega de obra: rubro por rubro. */
  @Get(':id/stock/:materialId/desglose')
  @Permisos('bodega.ver')
  desglose(@Param('id', ParseIntPipe) id: number, @Param('materialId', ParseIntPipe) materialId: number, @CurrentUser() yo: UsuarioSesion) {
    return this.service.desglose(yo, id, materialId);
  }

  /** Stock disponible por material para armar una solicitud de transferencia. */
  @Get(':id/disponible')
  @Permisos('bodega.ver')
  disponible(@Param('id', ParseIntPipe) id: number, @CurrentUser() yo: UsuarioSesion) {
    return this.service.disponible(yo, id);
  }

  /** Kardex con saldo anterior y nuevo. */
  @Get(':id/movimientos')
  @Permisos('bodega.ver')
  movimientos(@Param('id', ParseIntPipe) id: number, @Query() f: ListarMovimientosDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.movimientos(yo, id, f);
  }

  /** Ingreso, consumo, salida o ajuste (el permiso se valida según el tipo). */
  @Post(':id/movimientos')
  @Permisos('bodega.ver')
  registrar(@Param('id', ParseIntPipe) id: number, @Body() dto: MovimientoDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.registrar(yo, id, dto);
  }

  /** Lee un Excel de materiales (CODIGO, DESCRIPCIÓN, UNIDAD, CANTIDAD) y marca existentes, nuevos y errores. No guarda. */
  @Post(':id/ingresos/importar/leer')
  @Permisos('bodega.ingresar')
  @UseInterceptors(FileInterceptor('archivo', LIMITE_EXCEL))
  async leerIngreso(@Param('id', ParseIntPipe) id: number, @UploadedFile() archivo: { buffer: Buffer; size: number }, @CurrentUser() yo: UsuarioSesion) {
    const filas = filasMaterial(await leerTablaExcel(exigirXlsx(archivo), COLS_MATERIAL), true);
    return { filas: await this.service.revisarIngreso(yo, id, filas) };
  }

  /** Registra un ingreso por fila (crea los materiales que falten si tienes config.editar). */
  @Post(':id/ingresos/importar')
  @Permisos('bodega.ingresar')
  importarIngreso(@Param('id', ParseIntPipe) id: number, @Body() dto: ImportarIngresoDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.importarIngreso(yo, id, dto);
  }

  /** Revierte un movimiento con un movimiento contrario (el kardex no se edita). */
  @Post(':id/movimientos/:movId/revertir')
  @Permisos('bodega.ver')
  revertir(
    @Param('id', ParseIntPipe) id: number,
    @Param('movId', ParseIntPipe) movId: number,
    @Body() dto: RevertirDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.revertir(yo, id, String(movId), dto);
  }
}

@Controller('transferencias')
export class TransferenciasController {
  constructor(private readonly service: TransferenciasService) {}

  @Get()
  @Permisos('bodega.ver')
  listar(@Query() f: ListarTransferenciasDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.listar(yo, f);
  }

  @Get(':id')
  @Permisos('bodega.ver')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.obtener(yo, id);
  }

  /** Quien solicita firma al crear (necesita su firma registrada). */
  @Post()
  @Permisos('bodega.transferir')
  solicitar(@Body() dto: SolicitarTransferenciaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.solicitar(yo, dto);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @Permisos('bodega.firmar_transferencia')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() yo: UsuarioSesion) {
    return this.service.aprobar(yo, id);
  }

  @Post(':id/despachar')
  @HttpCode(200)
  @Permisos('bodega.firmar_transferencia')
  despachar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DespacharDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.despachar(yo, id, dto);
  }

  @Post(':id/recibir')
  @HttpCode(200)
  @Permisos('bodega.firmar_transferencia')
  recibir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecibirDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.recibir(yo, id, dto);
  }

  /** Bodega rechaza por falta de stock (en lugar de despachar). */
  @Post(':id/rechazar')
  @HttpCode(200)
  @Permisos('bodega.ver', 'bodega.firmar_transferencia')
  rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RechazarTransferenciaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.rechazar(yo, id, dto);
  }

  @Post(':id/anular')
  @HttpCode(200)
  @Permisos('bodega.ver')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularTransferenciaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.anular(yo, id, dto);
  }
}

/** Bandeja única de firmas pendientes del usuario: habilitaciones, transferencias y planillas. */
@Controller('firmas')
export class FirmasPendientesController {
  constructor(
    private readonly hab: HabilitacionService,
    private readonly transf: TransferenciasService,
    private readonly planillas: PlanillasService,
  ) {}

  @Get('pendientes')
  async pendientes(@CurrentUser() yo: UsuarioSesion) {
    const [h, t, p] = await Promise.all([this.hab.pendientes(yo), this.transf.pendientes(yo), this.planillas.pendientes(yo)]);
    return [...h, ...t, ...p];
  }
}

@Module({
  imports: [HabilitacionModule, PlanillasModule],
  controllers: [BodegasController, TransferenciasController, FirmasPendientesController],
  providers: [BodegaService, TransferenciasService],
})
export class BodegaModule {}

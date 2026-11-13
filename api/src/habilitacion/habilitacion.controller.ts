import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  CurrentUser,
  Permisos,
  type UsuarioSesion,
} from '../common/decorators.js';
import {
  AgregarContratistaDto,
  DocumentoContratistaDto,
  FirmarHabilitacionDto,
  ReemplazoDto,
  RequisitoDto,
  RevisionDocumentoDto,
  RevisionRequisitoDto,
} from './habilitacion.dto.js';
import { HabilitacionService } from './habilitacion.service.js';

@Controller('obras/:obraId/habilitacion')
export class HabilitacionController {
  constructor(private readonly service: HabilitacionService) {}

  /** Requisitos, contratistas con documentos, firmas y progreso. */
  @Get()
  @Permisos('obras.ver')
  obtener(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.obtener(yo, obraId);
  }

  /** Carga o actualiza un requisito (PRECIOS_MTK, COTIZACION, CONTRATO, ANTICIPO). Quita su OK. */
  @Put('requisitos/:codigo')
  @Permisos('habilitacion.cargar')
  guardarRequisito(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('codigo') codigo: string,
    @Body() dto: RequisitoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.guardarRequisito(yo, obraId, codigo, dto);
  }

  @Post('requisitos/:codigo/revision')
  @HttpCode(200)
  @Permisos('habilitacion.revisar')
  revisarRequisito(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('codigo') codigo: string,
    @Body() dto: RevisionRequisitoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.revisarRequisito(yo, obraId, codigo, dto.ok);
  }

  @Post('contratistas')
  @HttpCode(200)
  @Permisos('habilitacion.cargar')
  agregarContratista(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Body() dto: AgregarContratistaDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.agregarContratista(yo, obraId, dto);
  }

  @Delete('contratistas/:obraContratistaId')
  @Permisos('habilitacion.cargar')
  quitarContratista(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('obraContratistaId', ParseUUIDPipe) ocId: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.quitarContratista(yo, obraId, ocId);
  }

  /** Sube una nueva versión del documento (RUC, RL, IESS, SRI, FIEL, ANTIC, SUB). */
  @Put('contratistas/:obraContratistaId/documentos/:codigo')
  @Permisos('habilitacion.cargar')
  subirDocumento(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('obraContratistaId', ParseUUIDPipe) ocId: string,
    @Param('codigo') codigo: string,
    @Body() dto: DocumentoContratistaDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.subirDocumento(yo, obraId, ocId, codigo, dto);
  }

  /** Revisión SIG del documento. */
  @Post('documentos/:documentoId/revision')
  @HttpCode(200)
  @Permisos('habilitacion.revisar_sig')
  revisarDocumento(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @Body() dto: RevisionDocumentoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.revisarDocumento(yo, obraId, documentoId, dto);
  }

  /** Firma de aprobación del designado. Con las dos firmas la obra pasa a En ejecución. */
  @Post('firmar')
  @HttpCode(200)
  @Permisos('habilitacion.firmar')
  firmar(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Body() dto: FirmarHabilitacionDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.firmar(yo, obraId, dto.rol);
  }

  /** El propietario firma en reemplazo del superintendente. */
  @Post('firmar-reemplazo')
  @HttpCode(200)
  @Permisos('habilitacion.reemplazo')
  firmarReemplazo(
    @Param('obraId', ParseUUIDPipe) obraId: string,
    @Body() dto: ReemplazoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.firmarReemplazo(yo, obraId, dto.motivo);
  }
}

@Module({
  controllers: [HabilitacionController],
  providers: [HabilitacionService],
  exports: [HabilitacionService],
})
export class HabilitacionModule {}

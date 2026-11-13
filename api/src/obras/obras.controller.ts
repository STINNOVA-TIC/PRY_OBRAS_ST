import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  Permisos,
  type UsuarioSesion,
} from '../common/decorators.js';
import {
  ActualizarObraDto,
  CambiarEstadoDto,
  CrearObraDto,
  FirmantesDto,
  ListarObrasDto,
  MiembroDto,
} from './dto/obra.dto.js';
import { ObrasService } from './obras.service.js';

@Controller('obras')
export class ObrasController {
  constructor(private readonly service: ObrasService) {}

  /** Obras donde el usuario es miembro (o todas con obras.ver_todas). */
  @Get()
  @Permisos('obras.ver')
  listar(@Query() q: ListarObrasDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.listar(yo, q);
  }

  @Get(':id')
  @Permisos('obras.ver')
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.obtener(yo, id);
  }

  @Post()
  @Permisos('obras.crear')
  crear(@Body() dto: CrearObraDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.crear(dto, yo);
  }

  @Patch(':id')
  @Permisos('obras.editar')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarObraDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.actualizar(id, dto, yo);
  }

  @Delete(':id')
  @Permisos('obras.eliminar')
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.eliminar(id, yo);
  }

  /** Agrega un miembro o cambia su función. */
  @Put(':id/miembros/:usuarioId')
  @Permisos('obras.gestionar_equipo')
  asignarMiembro(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: MiembroDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.asignarMiembro(id, usuarioId, dto.funcion, yo);
  }

  @Delete(':id/miembros/:usuarioId')
  @Permisos('obras.gestionar_equipo')
  quitarMiembro(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.quitarMiembro(id, usuarioId, yo);
  }

  /** Designa quién firma la aprobación de habilitación (Administrador del contrato y Superintendente). */
  @Patch(':id/firmantes')
  @Permisos('obras.gestionar_equipo')
  designarFirmantes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FirmantesDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.designarFirmantes(id, dto, yo);
  }

  /** Suspender, reactivar o cerrar la obra. */
  @Patch(':id/estado')
  @Permisos('obras.cambiar_estado')
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.cambiarEstado(id, dto, yo);
  }
}

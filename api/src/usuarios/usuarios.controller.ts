import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Delete,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LIMITE_SUBIDA } from '../archivos/archivos.controller.js';
import type { ArchivoSubido } from '../archivos/archivos.service.js';
import {
  CurrentUser,
  Permisos,
  type UsuarioSesion,
} from '../common/decorators.js';
import {
  ActualizarUsuarioDto,
  AsignarRolesDto,
  CrearUsuarioDto,
  ExcepcionesPermisosDto,
  ListarUsuariosDto,
  ResetPasswordDto,
} from './dto/usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  @Permisos('usuarios.ver')
  listar(@Query() query: ListarUsuariosDto) {
    return this.service.listar(query);
  }

  @Get(':id')
  @Permisos('usuarios.ver')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Get(':id/permisos')
  @Permisos('usuarios.ver')
  permisos(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.permisos(id);
  }

  @Post()
  @Permisos('usuarios.crear')
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.crear(dto, yo.id);
  }

  @Patch(':id')
  @Permisos('usuarios.editar')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarUsuarioDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.actualizar(id, dto, yo.id);
  }

  @Patch(':id/activar')
  @Permisos('usuarios.desactivar')
  activar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.cambiarEstado(id, true, yo.id);
  }

  @Patch(':id/desactivar')
  @Permisos('usuarios.desactivar')
  desactivar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.cambiarEstado(id, false, yo.id);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Permisos('usuarios.reset_password')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.resetPassword(id, dto.password, yo.id);
  }

  /** Reemplaza el conjunto completo de roles del usuario. */
  @Put(':id/roles')
  @Permisos('usuarios.asignar_roles')
  asignarRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AsignarRolesDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.asignarRoles(id, dto.rolIds, yo.id);
  }

  /** Reemplaza las excepciones de permisos (conceder / denegar) del usuario. */
  @Put(':id/permisos')
  @Permisos('usuarios.asignar_roles')
  asignarExcepciones(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExcepcionesPermisosDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.asignarExcepciones(id, dto, yo.id);
  }

  /** Sube la firma de otro usuario (imagen, campo "archivo"). */
  @Put(':id/firma')
  @Permisos('usuarios.editar')
  @UseInterceptors(FileInterceptor('archivo', LIMITE_SUBIDA))
  subirFirma(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: ArchivoSubido,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.asignarFirma(id, archivo, yo.id);
  }

  @Delete(':id/firma')
  @Permisos('usuarios.editar')
  quitarFirma(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.quitarFirma(id, yo.id);
  }
}

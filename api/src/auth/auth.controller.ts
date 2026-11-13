import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LIMITE_SUBIDA } from '../archivos/archivos.controller.js';
import type { ArchivoSubido } from '../archivos/archivos.service.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { cargarSesion } from '../common/sesion.js';
import { DataSource } from 'typeorm';
import {
  CurrentUser,
  Public,
  type UsuarioSesion,
} from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { CambiarPasswordDto, LoginDto } from './dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly usuarios: UsuariosService,
    private readonly db: DataSource,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.service.login(dto.email, dto.password);
  }

  /** Usuario actual con roles y permisos efectivos (para armar el menú del front). */
  @Get('me')
  me(@CurrentUser() yo: UsuarioSesion) {
    return yo;
  }

  @Patch('password')
  cambiarPassword(
    @Body() dto: CambiarPasswordDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.cambiarPassword(yo.id, dto.actual, dto.nueva);
  }

  /** Sube MI firma (imagen PNG/JPG, campo "archivo"). Se estampa en los documentos que firme. */
  @Put('firma')
  @UseInterceptors(FileInterceptor('archivo', LIMITE_SUBIDA))
  async miFirma(
    @UploadedFile() archivo: ArchivoSubido,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    await this.usuarios.asignarFirma(yo.id, archivo, yo.id);
    return cargarSesion(this.db, yo.id);
  }

  /** Mi perfil completo, incluido el id del archivo de firma para mostrarla. */
  @Get('perfil')
  perfil(@CurrentUser() yo: UsuarioSesion) {
    return this.usuarios.obtener(yo.id);
  }
}

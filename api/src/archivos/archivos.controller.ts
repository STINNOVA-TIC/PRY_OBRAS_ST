import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser, type UsuarioSesion } from '../common/decorators.js';
import { type ArchivoSubido, ArchivosService } from './archivos.service.js';

class SubirArchivoDto {
  @IsOptional()
  @IsIn(['DOCUMENTO', 'EVIDENCIA'])
  categoria?: 'DOCUMENTO' | 'EVIDENCIA';
}

export const LIMITE_SUBIDA = {
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
};

@Controller('archivos')
export class ArchivosController {
  constructor(private readonly service: ArchivosService) {}

  /** Sube un PDF o imagen (multipart, campo "archivo"). Devuelve el id para asociarlo a requisitos, documentos, etc. */
  @Post()
  @UseInterceptors(FileInterceptor('archivo', LIMITE_SUBIDA))
  subir(
    @UploadedFile() archivo: ArchivoSubido,
    @Body() dto: SubirArchivoDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.guardar(archivo, dto.categoria ?? 'DOCUMENTO', yo.id);
  }

  @Get(':id')
  metadatos(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  /** Descarga/visualiza el archivo (requiere sesión). */
  @Get(':id/contenido')
  async contenido(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { archivo, stream } = await this.service.abrir(id);
    res.set({
      'Content-Type': archivo.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombreOriginal)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(stream);
  }
}

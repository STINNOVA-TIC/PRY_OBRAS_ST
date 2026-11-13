import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { EntityManager, Repository } from 'typeorm';
import { Archivo, CategoriaArchivo } from './archivo.entity.js';

/** Lo mínimo que necesitamos del archivo recibido por multer (memoria). */
export interface ArchivoSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Documentos (p. ej. el contrato firmado) hasta 50 MB; la firma, hasta 5 MB. */
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FIRMA = 5 * 1024 * 1024;

/** Tipo real según los primeros bytes (no confiamos en la extensión ni en el mimetype del navegador). */
function detectarTipo(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' };
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47)
    return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

@Injectable()
export class ArchivosService {
  private readonly dir: string;

  constructor(
    @InjectRepository(Archivo) private readonly repo: Repository<Archivo>,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
  }

  /**
   * Guarda el archivo en disco y registra sus metadatos.
   * FIRMA solo acepta imágenes; DOCUMENTO y EVIDENCIA aceptan PDF e imágenes.
   */
  async guardar(
    archivo: ArchivoSubido | undefined,
    categoria: CategoriaArchivo,
    usuarioId: string,
    m?: EntityManager,
  ): Promise<Archivo> {
    if (!archivo?.buffer?.length)
      throw new BadRequestException(
        'No se recibió ningún archivo (campo "archivo")',
      );
    if (archivo.size > MAX_BYTES)
      throw new PayloadTooLargeException('El archivo supera 50 MB');
    if (categoria === 'FIRMA' && archivo.size > MAX_FIRMA)
      throw new PayloadTooLargeException('La imagen de la firma supera 5 MB');

    const tipo = detectarTipo(archivo.buffer);
    if (!tipo)
      throw new UnsupportedMediaTypeException(
        'Solo se aceptan PDF, JPG, PNG o WEBP',
      );
    if (categoria === 'FIRMA' && tipo.mime === 'application/pdf') {
      throw new UnsupportedMediaTypeException(
        'La firma debe ser una imagen (PNG con fondo transparente recomendado)',
      );
    }

    const hoy = new Date().toISOString().slice(0, 7); // YYYY-MM
    const relativa = join(
      categoria.toLowerCase(),
      hoy,
      `${randomUUID()}.${tipo.ext}`,
    );
    await mkdir(join(this.dir, categoria.toLowerCase(), hoy), {
      recursive: true,
    });
    await writeFile(join(this.dir, relativa), archivo.buffer, { flag: 'wx' });

    const repo = m ? m.getRepository(Archivo) : this.repo;
    const guardado = await repo.save({
      nombreOriginal: (archivo.originalname || `archivo.${tipo.ext}`).slice(
        0,
        255,
      ),
      mime: tipo.mime,
      tamano: archivo.size,
      ruta: relativa,
      sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
      categoria,
      subidoPor: usuarioId,
    });
    return this.obtener(guardado.id, m);
  }

  async obtener(id: string, m?: EntityManager): Promise<Archivo> {
    const a = await (m ? m.getRepository(Archivo) : this.repo).findOneBy({
      id,
    });
    if (!a) throw new NotFoundException('Archivo no encontrado');
    return a;
  }

  /** Abre el archivo para enviarlo al cliente. */
  async abrir(id: string) {
    const a = await this.repo
      .createQueryBuilder('a')
      .addSelect('a.ruta')
      .where('a.id = :id', { id })
      .getOne();
    if (!a) throw new NotFoundException('Archivo no encontrado');
    const ruta = resolve(this.dir, a.ruta);
    if (!ruta.startsWith(this.dir))
      throw new NotFoundException('Archivo no encontrado');
    try {
      await stat(ruta);
    } catch {
      throw new NotFoundException('El archivo no está en el servidor');
    }
    return { archivo: a, stream: createReadStream(ruta) };
  }
}

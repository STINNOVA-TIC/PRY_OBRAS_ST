import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Archivo } from './archivo.entity.js';
import { ArchivosController } from './archivos.controller.js';
import { ArchivosService } from './archivos.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Archivo])],
  controllers: [ArchivosController],
  providers: [ArchivosService],
  exports: [ArchivosService],
})
export class ArchivosModule {}

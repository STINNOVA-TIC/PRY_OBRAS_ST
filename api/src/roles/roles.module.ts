import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Modulo } from './entities/modulo.entity.js';
import { Permiso } from './entities/permiso.entity.js';
import { Rol } from './entities/rol.entity.js';
import { PermisosController, RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Rol, Permiso, Modulo])],
  controllers: [RolesController, PermisosController],
  providers: [RolesService],
  exports: [TypeOrmModule],
})
export class RolesModule {}

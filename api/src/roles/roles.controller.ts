import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
  ActualizarRolDto,
  AsignarPermisosRolDto,
  CrearRolDto,
  ListarRolesDto,
} from './dto/rol.dto.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @Permisos('roles.ver')
  listar(@Query() query: ListarRolesDto) {
    return this.service.listar(query);
  }

  @Get(':id')
  @Permisos('roles.ver')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }

  @Post()
  @Permisos('roles.crear')
  crear(@Body() dto: CrearRolDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.crear(dto, yo.id);
  }

  @Patch(':id')
  @Permisos('roles.editar')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarRolDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.actualizar(id, dto, yo.id);
  }

  /** Reemplaza el conjunto completo de permisos del rol. */
  @Put(':id/permisos')
  @Permisos('roles.editar')
  asignarPermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarPermisosRolDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.asignarPermisos(id, dto.permisoIds, yo.id);
  }

  @Patch(':id/activar')
  @Permisos('roles.desactivar')
  activar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.cambiarEstado(id, true, yo.id);
  }

  @Patch(':id/desactivar')
  @Permisos('roles.desactivar')
  desactivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.cambiarEstado(id, false, yo.id);
  }
}

/** GET /api/permisos → módulos con sus permisos. */
@Controller('permisos')
export class PermisosController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @Permisos('roles.ver')
  catalogo() {
    return this.service.catalogoPermisos();
  }
}

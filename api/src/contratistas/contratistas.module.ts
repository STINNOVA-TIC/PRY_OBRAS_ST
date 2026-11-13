import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { DataSource } from 'typeorm';
import {
  CurrentUser,
  Permisos,
  type UsuarioSesion,
} from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const vacioANull = ({ value }: { value: unknown }) =>
  value === '' ? null : typeof value === 'string' ? value.trim() : value;

export class CrearContratistaDto {
  @Matches(/^\d{13}$/, { message: 'El RUC debe tener 13 dígitos' })
  ruc: string;

  @Transform(recortar)
  @IsString()
  @Length(2, 200)
  razonSocial: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 200)
  nombreComercial?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(2, 150)
  representanteLegal?: string;

  @IsOptional()
  @Transform(recortar)
  @IsEmail({}, { message: 'email no es válido' })
  email?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(5, 30)
  telefono?: string;
}

export class ActualizarContratistaDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(2, 200)
  razonSocial?: string;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 200)
  nombreComercial?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(2, 150)
  representanteLegal?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsEmail({}, { message: 'email no es válido' })
  email?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(5, 30)
  telefono?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

const SELECT = `
  SELECT c.id, c.ruc, c.razon_social AS "razonSocial", c.nombre_comercial AS "nombreComercial",
         c.representante_legal AS "representanteLegal", c.email, c.telefono, c.activo,
         c.created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM obra_contratistas oc JOIN obras o ON o.id = oc.obra_id
           WHERE oc.contratista_id = c.id AND oc.activo AND o.eliminado_en IS NULL) AS "totalObras"
    FROM contratistas c`;

@Injectable()
export class ContratistasService {
  constructor(private readonly db: DataSource) {}

  listar(q?: string) {
    const t = q?.trim();
    return t
      ? this.db.query(
          `${SELECT} WHERE c.razon_social ILIKE $1 OR c.nombre_comercial ILIKE $1 OR c.ruc LIKE $1 ORDER BY c.razon_social`,
          [`%${t}%`],
        )
      : this.db.query(`${SELECT} ORDER BY c.activo DESC, c.razon_social`);
  }

  async obtener(id: string) {
    const [c] = await this.db.query(`${SELECT} WHERE c.id = $1`, [id]);
    if (!c) throw new NotFoundException('Contratista no encontrado');
    return c;
  }

  async crear(dto: CrearContratistaDto, u: UsuarioSesion) {
    const [ya] = await this.db.query(
      `SELECT razon_social FROM contratistas WHERE ruc = $1`,
      [dto.ruc],
    );
    if (ya)
      throw new ConflictException(
        `El RUC ya está registrado (${ya.razon_social})`,
      );
    const [{ id }] = await enTransaccion(this.db, u.id, (m) =>
      m.query(
        `INSERT INTO contratistas (ruc, razon_social, nombre_comercial, representante_legal, email, telefono)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          dto.ruc,
          dto.razonSocial,
          dto.nombreComercial ?? null,
          dto.representanteLegal ?? null,
          dto.email ?? null,
          dto.telefono ?? null,
        ],
      ),
    );
    return this.obtener(id);
  }

  async actualizar(
    id: string,
    dto: ActualizarContratistaDto,
    u: UsuarioSesion,
  ) {
    await this.obtener(id);
    const mapa: Record<string, string> = {
      razonSocial: 'razon_social',
      nombreComercial: 'nombre_comercial',
      representanteLegal: 'representante_legal',
      email: 'email',
      telefono: 'telefono',
      activo: 'activo',
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, col] of Object.entries(mapa)) {
      const v = (dto as Record<string, unknown>)[k];
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    }
    if (sets.length) {
      params.push(id);
      await enTransaccion(this.db, u.id, (m) =>
        m.query(
          `UPDATE contratistas SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params,
        ),
      );
    }
    return this.obtener(id);
  }
}

@Controller('contratistas')
export class ContratistasController {
  constructor(private readonly service: ContratistasService) {}

  @Get()
  @Permisos('contratistas.ver')
  listar(@Query('q') q?: string) {
    return this.service.listar(q);
  }

  @Get(':id')
  @Permisos('contratistas.ver')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Post()
  @Permisos('contratistas.gestionar')
  crear(@Body() dto: CrearContratistaDto, @CurrentUser() yo: UsuarioSesion) {
    return this.service.crear(dto, yo);
  }

  @Patch(':id')
  @Permisos('contratistas.gestionar')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarContratistaDto,
    @CurrentUser() yo: UsuarioSesion,
  ) {
    return this.service.actualizar(id, dto, yo);
  }
}

@Module({
  controllers: [ContratistasController],
  providers: [ContratistasService],
  exports: [ContratistasService],
})
export class ContratistasModule {}

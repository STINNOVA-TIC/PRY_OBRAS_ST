import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { randomBytes, randomInt } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { LIMITE_SUBIDA } from '../archivos/archivos.controller.js';
import { ArchivosService, type ArchivoSubido } from '../archivos/archivos.service.js';
import { asegurarAccesoObra, exigirEstado } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, Public, type UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import { FirmasService } from '../firmas/firmas.service.js';

class CrearAccesoDto {
  /** DOCUMENTO = un requisito de habilitación; CONTRATISTA = los documentos habilitantes de un contratista. */
  @IsIn(['DOCUMENTO', 'CONTRATISTA']) tipo!: 'DOCUMENTO' | 'CONTRATISTA';
  @IsOptional() @IsString() @MaxLength(30) requisito?: string;
  @IsOptional() @IsUUID() obraContratistaId?: string;
  @IsString() @Length(2, 150) nombre!: string;
  @IsEmail({}, { message: 'Correo no válido' }) @MaxLength(150) email!: string;
}

class SubidaPublicaDto {
  /** Solo enlaces de contratista: código del documento (RUC, IESS...). */
  @IsOptional() @IsString() @MaxLength(30) @Matches(/^[A-Za-z0-9_]+$/) documento?: string;
  @IsOptional() @IsDateString({ strict: true }) vence?: string;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigo6 = () => Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const HOY = `(now() AT TIME ZONE 'America/Guayaquil')::date`;

interface Acceso {
  id: string; obraId: string; tipo: 'DOCUMENTO' | 'CONTRATISTA'; tipoRequisitoId: number | null; obraContratistaId: string | null;
  nombre: string; email: string; codigo: string; maxIntentos: number; estado: string; creadoPor: string;
  obraNombre: string; obraCliente: string | null; obraEstado: string; requisitoNombre: string | null; requisitoAdjunto: string | null;
  requisitoCodigo: string | null; contratistaNombre: string | null; creadoPorNombre: string;
}

/**
 * Pedir un documento por correo (como «Pedir documento por correo» de la app anterior):
 * se genera un enlace personal; quien lo recibe sube el archivo sin crear cuenta, con un número limitado de correcciones.
 * Lo subido queda igual que si lo cargara el equipo: el requisito vuelve a revisión y los documentos quedan pendientes del SIG.
 */
@Injectable()
export class AccesosService {
  constructor(
    private readonly db: DataSource,
    private readonly archivos: ArchivosService,
    private readonly firmas: FirmasService,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar(u: UsuarioSesion, obraId: string) {
    await asegurarAccesoObra(this.db, u, obraId);
    return this.db.query(
      `SELECT a.id, a.tipo, a.nombre, a.email, a.codigo, a.token, a.estado, a.max_intentos AS "maxIntentos", a.created_at AS "creadoEn",
              a.cerrado_en AS "cerradoEn", u.nombre AS "creadoPorNombre", t.nombre AS "requisitoNombre", c.razon_social AS "contratistaNombre",
              COALESCE((SELECT SUM(x.usos) FROM acceso_externo_usos x WHERE x.acceso_id = a.id), 0)::int AS usos,
              (SELECT MAX(x.usos) FROM acceso_externo_usos x WHERE x.acceso_id = a.id)::int AS "maxUsos"
         FROM accesos_externos a JOIN usuarios u ON u.id = a.creado_por
         LEFT JOIN tipos_requisito t ON t.id = a.tipo_requisito_id
         LEFT JOIN obra_contratistas oc ON oc.id = a.obra_contratista_id LEFT JOIN contratistas c ON c.id = oc.contratista_id
        WHERE a.obra_id = $1 AND a.tipo IN ('DOCUMENTO','CONTRATISTA') AND a.token IS NOT NULL
        ORDER BY (a.estado = 'ABIERTO') DESC, a.created_at DESC`,
      [obraId],
    );
  }

  async crear(u: UsuarioSesion, obraId: string, d: CrearAccesoDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    let tipoRequisitoId: number | null = null;
    let obraContratistaId: string | null = null;
    let detalle: string;
    if (d.tipo === 'DOCUMENTO') {
      exigirEstado(estado, ['HABILITACION'], 'pedir requisitos de habilitación');
      const [t] = await this.db.query(`SELECT id, nombre FROM tipos_requisito WHERE codigo = $1 AND activo`, [d.requisito ?? '']);
      if (!t) throw new BadRequestException('Indica el requisito que se pide');
      tipoRequisitoId = t.id;
      detalle = t.nombre;
    } else {
      exigirEstado(estado, ['HABILITACION', 'ACTIVA', 'PAUSADA'], 'pedir documentos de contratistas');
      const [oc] = await this.db.query(
        `SELECT oc.id, c.razon_social FROM obra_contratistas oc JOIN contratistas c ON c.id = oc.contratista_id WHERE oc.id = $1 AND oc.obra_id = $2`,
        [d.obraContratistaId ?? null, obraId],
      );
      if (!oc) throw new BadRequestException('Indica el contratista de la obra');
      obraContratistaId = oc.id;
      detalle = `documentos de ${oc.razon_social}`;
    }
    const [{ max }] = await this.db.query(
      `SELECT COALESCE((SELECT valor FROM parametros WHERE clave = 'ACCESO_MAX_INTENTOS'), '5')::int AS max`,
    );
    const id = await enTransaccion(this.db, u.id, async (m) => {
      let cod = codigo6();
      for (let i = 0; i < 5; i++) {
        const [x] = await m.query(`SELECT 1 FROM accesos_externos WHERE codigo = $1`, [cod]);
        if (!x) break;
        cod = codigo6();
      }
      const [{ id }] = await m.query(
        `INSERT INTO accesos_externos (obra_id, tipo, tipo_requisito_id, obra_contratista_id, nombre, email, codigo, token, max_intentos, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [obraId, d.tipo, tipoRequisitoId, obraContratistaId, d.nombre.trim(), d.email.trim().toLowerCase(), cod, randomBytes(32).toString('hex'), max, u.id],
      );
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Pidió un documento por enlace externo',
          detalle: `${detalle} a ${d.nombre.trim()} (${d.email.trim().toLowerCase()}), código ${cod}`,
          usuarioId: u.id,
          modulo: 'HABILITACION',
          entidad: 'ACCESO',
          entidadId: id,
        },
        m,
      );
      return id as string;
    });
    return (await this.listar(u, obraId)).find((x: { id: string }) => x.id === id);
  }

  async cancelar(u: UsuarioSesion, obraId: string, id: string) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const [a] = await m.query(`SELECT nombre, email, estado FROM accesos_externos WHERE id = $1 AND obra_id = $2 FOR UPDATE`, [id, obraId]);
      if (!a) throw new NotFoundException('Pedido no encontrado');
      if (a.estado !== 'ABIERTO') throw new ConflictException('El enlace ya está cerrado');
      await m.query(`UPDATE accesos_externos SET estado = 'CANCELADO', cerrado_en = now(), cancelado_por = $2 WHERE id = $1`, [id, u.id]);
      await this.bitacora.registrar(
        { obraId, accion: 'Canceló un enlace de carga externo', detalle: `${a.nombre} (${a.email})`, usuarioId: u.id, modulo: 'HABILITACION', entidad: 'ACCESO', entidadId: id },
        m,
      );
    });
    return { ok: true };
  }

  // =================================================================== público (sin cuenta)

  private async porToken(db: DataSource | EntityManager, token: string, bloquear = false): Promise<Acceso> {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new NotFoundException('Enlace no válido');
    const [a] = await db.query(
      `SELECT a.id, a.obra_id AS "obraId", a.tipo, a.tipo_requisito_id AS "tipoRequisitoId", a.obra_contratista_id AS "obraContratistaId",
              a.nombre, a.email, a.codigo, a.max_intentos AS "maxIntentos", a.estado, a.creado_por AS "creadoPor",
              o.nombre AS "obraNombre", o.cliente AS "obraCliente", o.estado AS "obraEstado",
              t.nombre AS "requisitoNombre", t.etiqueta_adjunto AS "requisitoAdjunto", t.codigo AS "requisitoCodigo",
              c.razon_social AS "contratistaNombre", u.nombre AS "creadoPorNombre"
         FROM accesos_externos a JOIN obras o ON o.id = a.obra_id AND o.eliminado_en IS NULL
         JOIN usuarios u ON u.id = a.creado_por
         LEFT JOIN tipos_requisito t ON t.id = a.tipo_requisito_id
         LEFT JOIN obra_contratistas oc ON oc.id = a.obra_contratista_id LEFT JOIN contratistas c ON c.id = oc.contratista_id
        WHERE a.token = $1 ${bloquear ? 'FOR UPDATE OF a' : ''}`,
      [token],
    );
    if (!a) throw new NotFoundException('Enlace no válido');
    return a;
  }

  /** Lo que ve quien abre el enlace: qué se le pide, cuántas subidas le quedan y lo que ya subió. */
  async verPublico(token: string) {
    const a = await this.porToken(this.db, token);
    const usos: { clave: string; usos: number }[] = await this.db.query(`SELECT clave, usos FROM acceso_externo_usos WHERE acceso_id = $1`, [a.id]);
    const usado = (k: string) => usos.find((x) => x.clave === k)?.usos ?? 0;
    const abierto = a.estado === 'ABIERTO' && this.obraAdmite(a);
    const base = {
      obra: a.obraNombre,
      cliente: a.obraCliente,
      nombre: a.nombre,
      pedidoPor: a.creadoPorNombre,
      tipo: a.tipo,
      estado: a.estado,
      abierto,
      motivoCierre: a.estado === 'CANCELADO' ? 'El pedido fue cancelado' : a.estado === 'CERRADO' ? 'Ya usaste todas las subidas' : !this.obraAdmite(a) ? 'La obra ya no recibe este documento' : null,
      maxSubidas: a.maxIntentos,
    };
    if (a.tipo === 'DOCUMENTO') {
      const [r] = await this.db.query(
        `SELECT a.nombre_original AS archivo, r.cargado_en AS "cargadoEn", (r.revisado_en IS NOT NULL) AS revisado
           FROM obra_requisitos r LEFT JOIN archivos a ON a.id = r.archivo_id WHERE r.obra_id = $1 AND r.tipo_id = $2`,
        [a.obraId, a.tipoRequisitoId],
      );
      return {
        ...base,
        documentos: [
          {
            codigo: a.requisitoCodigo,
            nombre: a.requisitoNombre,
            adjunto: a.requisitoAdjunto,
            vence: false,
            usadas: usado(a.requisitoCodigo ?? ''),
            quedan: Math.max(0, a.maxIntentos - usado(a.requisitoCodigo ?? '')),
            actual: r?.archivo ? { archivo: r.archivo, cargadoEn: r.cargadoEn, estado: r.revisado ? 'REVISADO' : 'PENDIENTE' } : null,
          },
        ],
      };
    }
    const docs: { codigo: string; nombre: string; vence: boolean; archivo: string | null; cargadoEn: string | null; estado: string | null; observacion: string | null; venceEl: string | null }[] =
      await this.db.query(
        `SELECT t.codigo, t.nombre, t.vence, a.nombre_original AS archivo, d.cargado_en AS "cargadoEn", d.estado, d.observacion,
                to_char(d.vence, 'YYYY-MM-DD') AS "venceEl"
           FROM tipos_documento_contratista t
           LEFT JOIN contratista_documentos d ON d.tipo_id = t.id AND d.obra_contratista_id = $1 AND d.vigente
           LEFT JOIN archivos a ON a.id = d.archivo_id
          WHERE t.activo ORDER BY t.orden`,
        [a.obraContratistaId],
      );
    return {
      ...base,
      contratista: a.contratistaNombre,
      documentos: docs.map((d) => ({
        codigo: d.codigo,
        nombre: d.nombre,
        vence: d.vence,
        usadas: usado(d.codigo),
        quedan: Math.max(0, a.maxIntentos - usado(d.codigo)),
        actual: d.archivo ? { archivo: d.archivo, cargadoEn: d.cargadoEn, estado: d.estado, observacion: d.observacion, vence: d.venceEl } : null,
      })),
    };
  }

  async subirPublico(token: string, archivo: ArchivoSubido | undefined, d: SubidaPublicaDto) {
    const pre = await this.porToken(this.db, token);
    await enTransaccion(this.db, pre.creadoPor, async (m) => {
      const a = await this.porToken(m, token, true);
      if (a.estado !== 'ABIERTO') throw new ConflictException('Este enlace ya está cerrado');
      if (!this.obraAdmite(a)) throw new ConflictException('La obra ya no recibe este documento');
      const quien = `${a.nombre} (${a.email}) por enlace externo`;
      let clave: string;
      if (a.tipo === 'DOCUMENTO') {
        if (d.documento && d.documento !== a.requisitoCodigo) throw new BadRequestException('Documento no válido para este enlace');
        if (d.vence) throw new BadRequestException('Este documento no lleva vencimiento');
        clave = a.requisitoCodigo!;
        await this.contarUso(m, a, clave);
        const guardado = await this.archivos.guardar(archivo, 'DOCUMENTO', a.creadoPor, m);
        const [previo] = await m.query(`SELECT 1 FROM obra_requisitos WHERE obra_id = $1 AND tipo_id = $2`, [a.obraId, a.tipoRequisitoId]);
        await m.query(
          `INSERT INTO obra_requisitos (obra_id, tipo_id, archivo_id, cargado_por, cargado_en) VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (obra_id, tipo_id) DO UPDATE SET archivo_id = EXCLUDED.archivo_id, cargado_por = EXCLUDED.cargado_por,
             cargado_en = now(), revisado_por = NULL, revisado_en = NULL`,
          [a.obraId, a.tipoRequisitoId, guardado.id, a.creadoPor],
        );
        const reiniciadas = await this.firmas.reiniciar(m, 'HABILITACION', a.obraId);
        await this.bitacora.registrar(
          {
            obraId: a.obraId,
            accion: previo ? 'Actualizó un requisito de habilitación' : 'Cargó un requisito de habilitación',
            detalle: `${a.requisitoNombre}: ${guardado.nombreOriginal}, subido por ${quien}${reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''}`,
            usuarioId: null,
            modulo: 'HABILITACION',
            entidad: 'ACCESO',
            entidadId: a.id,
          },
          m,
        );
      } else {
        const [t] = await m.query(`SELECT id, codigo, nombre, vence FROM tipos_documento_contratista WHERE codigo = $1 AND activo`, [
          (d.documento ?? '').toUpperCase(),
        ]);
        if (!t) throw new BadRequestException('Elige el documento que vas a subir');
        if (t.vence && !d.vence) throw new BadRequestException(`«${t.nombre}» requiere la fecha de vencimiento`);
        if (!t.vence && d.vence) throw new BadRequestException(`«${t.nombre}» no lleva vencimiento`);
        if (d.vence) {
          const [{ vencido }] = await m.query(`SELECT $1::date < ${HOY} AS vencido`, [d.vence]);
          if (vencido) throw new BadRequestException('El documento ya está vencido');
        }
        clave = t.codigo;
        await this.contarUso(m, a, clave);
        const guardado = await this.archivos.guardar(archivo, 'DOCUMENTO', a.creadoPor, m);
        const [{ v }] = await m.query(
          `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM contratista_documentos WHERE obra_contratista_id = $1 AND tipo_id = $2`,
          [a.obraContratistaId, t.id],
        );
        await m.query(
          `INSERT INTO contratista_documentos (obra_contratista_id, tipo_id, version, archivo_id, vence, cargado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
          [a.obraContratistaId, t.id, v, guardado.id, d.vence ?? null, a.creadoPor],
        );
        const reiniciadas = a.obraEstado === 'HABILITACION' ? await this.firmas.reiniciar(m, 'HABILITACION', a.obraId) : 0;
        await this.bitacora.registrar(
          {
            obraId: a.obraId,
            accion: 'Cargó un documento de contratista',
            detalle: `${a.contratistaNombre}: ${t.nombre} (versión ${v}), subido por ${quien}${reiniciadas ? `. Se reiniciaron ${reiniciadas} firma(s)` : ''}`,
            usuarioId: null,
            modulo: 'HABILITACION',
            entidad: 'ACCESO',
            entidadId: a.id,
          },
          m,
        );
      }
      // Un requisito: el enlace se cierra al agotar las subidas. Contratista: cuando todos los documentos se agotaron.
      const [{ agotado }] = await m.query(
        a.tipo === 'DOCUMENTO'
          ? `SELECT usos >= $2 AS agotado FROM acceso_externo_usos WHERE acceso_id = $1 AND clave = $3`
          : `SELECT (SELECT COUNT(*) FROM acceso_externo_usos WHERE acceso_id = $1 AND usos >= $2)
                    >= (SELECT COUNT(*) FROM tipos_documento_contratista WHERE activo) AND $3::text IS NOT NULL AS agotado`,
        [a.id, a.maxIntentos, clave],
      );
      if (agotado) await m.query(`UPDATE accesos_externos SET estado = 'CERRADO', cerrado_en = now() WHERE id = $1`, [a.id]);
      if (!(await m.query(`SELECT canjeado_en FROM accesos_externos WHERE id = $1`, [a.id]))[0].canjeado_en)
        await m.query(`UPDATE accesos_externos SET canjeado_en = now() WHERE id = $1`, [a.id]);
    });
    return this.verPublico(token);
  }

  private obraAdmite(a: Acceso) {
    return a.tipo === 'DOCUMENTO' ? a.obraEstado === 'HABILITACION' : ['HABILITACION', 'ACTIVA', 'PAUSADA'].includes(a.obraEstado);
  }

  private async contarUso(m: EntityManager, a: Acceso, clave: string) {
    const [x] = await m.query(
      `INSERT INTO acceso_externo_usos (acceso_id, clave, usos) VALUES ($1, $2, 1)
       ON CONFLICT (acceso_id, clave) DO UPDATE SET usos = acceso_externo_usos.usos + 1
       RETURNING usos`,
      [a.id, clave],
    );
    if (x.usos > a.maxIntentos) throw new ConflictException('Ya usaste todas las subidas permitidas para este documento');
  }
}

@Controller()
export class AccesosController {
  constructor(private readonly s: AccesosService) {}

  @Get('obras/:obraId/accesos')
  @Permisos('habilitacion.accesos_externos')
  listar(@Param('obraId', ParseUUIDPipe) obraId: string, @CurrentUser() u: UsuarioSesion) {
    return this.s.listar(u, obraId);
  }

  @Post('obras/:obraId/accesos')
  @Permisos('habilitacion.accesos_externos')
  crear(@Param('obraId', ParseUUIDPipe) obraId: string, @Body() d: CrearAccesoDto, @CurrentUser() u: UsuarioSesion) {
    return this.s.crear(u, obraId, d);
  }

  @Post('obras/:obraId/accesos/:id/cancelar')
  @HttpCode(200)
  @Permisos('habilitacion.accesos_externos')
  cancelar(@Param('obraId', ParseUUIDPipe) obraId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: UsuarioSesion) {
    return this.s.cancelar(u, obraId, id);
  }

  @Public()
  @Get('publico/cargas/:token')
  ver(@Param('token') token: string) {
    return this.s.verPublico(token);
  }

  @Public()
  @Post('publico/cargas/:token')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', LIMITE_SUBIDA))
  subir(@Param('token') token: string, @UploadedFile() archivo: ArchivoSubido | undefined, @Body() d: SubidaPublicaDto) {
    return this.s.subirPublico(token, archivo, d);
  }
}

@Module({ controllers: [AccesosController], providers: [AccesosService] })
export class AccesosModule {}

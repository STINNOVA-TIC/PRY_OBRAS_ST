import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Body,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BitacoraService } from '../common/bitacora.service.js';
import { CurrentUser, Permisos, Public, type UsuarioSesion } from '../common/decorators.js';

/** Nombres válidos de archivos de respaldo (evita rutas fuera de la carpeta). */
const NOMBRE_VALIDO = /^(bd|adjuntos)_(\d{4}-\d{2}-\d{2}_\d{4,6}(?:_\d+)?)\.(dump|tgz)$/;

/** "30 23 * * *" → "Todos los días a las 23:30". Otros formatos se muestran tal cual. */
export function describirCron(cron: string): string {
  const p = cron.trim().split(/\s+/);
  if (p.length === 5 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1]) && p[2] === '*' && p[3] === '*') {
    const hora = `${p[1].padStart(2, '0')}:${p[0].padStart(2, '0')}`;
    if (p[4] === '*') return `Todos los días a las ${hora}`;
    if (p[4] === '1-5') return `De lunes a viernes a las ${hora}`;
  }
  return `Según la programación «${cron}»`;
}

interface EstadoManual {
  enCurso: boolean;
  inicio?: string;
  usuario?: string;
  ultimo?: { fin: string; ok: boolean; mensaje: string; usuario: string };
}

function ejecutar(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((ok, mal) => {
    const p = spawn(cmd, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', (e: NodeJS.ErrnoException) =>
      mal(new Error(e.code === 'ENOENT' ? `Falta el programa ${cmd} en el contenedor de la API (reconstrúyela)` : e.message)),
    );
    p.on('close', (code) => (code === 0 ? ok() : mal(new Error(err.trim().split('\n').pop() || `${cmd} terminó con código ${code}`))));
  });
}

@Injectable()
export class RespaldosService {
  private readonly log = new Logger('Respaldos');
  private estado: EstadoManual = { enCurso: false };

  constructor(
    private readonly config: ConfigService,
    private readonly bitacora: BitacoraService,
  ) {}

  private get dir(): string | null {
    const d = this.config.get<string>('BACKUP_DIR');
    return d ? resolve(d) : null;
  }
  private get cron() {
    return this.config.get<string>('BACKUP_CRON') || '30 23 * * *';
  }
  private exigirDir(): string {
    const d = this.dir;
    if (!d) throw new ServiceUnavailableException('Los respaldos no están configurados en este servidor (falta BACKUP_DIR)');
    return d;
  }

  private envPg(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PGHOST: this.config.get<string>('DB_HOST', 'localhost'),
      PGPORT: String(this.config.get('DB_PORT', 5432)),
      PGUSER: this.config.get<string>('DB_USER'),
      PGPASSWORD: this.config.get<string>('DB_PASSWORD'),
      PGDATABASE: this.config.get<string>('DB_NAME'),
    };
  }
  private get uploads() {
    return resolve(this.config.get<string>('UPLOAD_DIR', './uploads'));
  }
  /** Fecha y hora de Ecuador (UTC-5 todo el año) para nombres de archivo. */
  private sello() {
    const ahora = new Date(Date.now() - 5 * 3600_000);
    return { ahora, fecha: ahora.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '') };
  }

  // ------------------------------------------------ enlaces de descarga de un solo uso
  /** Enlaces de un solo uso: el navegador descarga directo (sin cargar el archivo en memoria) y sin token de sesión en la URL. */
  private enlaces = new Map<string, { tipo: 'archivo' | 'directo'; nombre?: string; usuario: UsuarioSesion; vence: number }>();

  async crearEnlace(u: UsuarioSesion, nombre?: string) {
    const dir = this.exigirDir();
    if (nombre) {
      if (!NOMBRE_VALIDO.test(nombre)) throw new BadRequestException('Nombre de respaldo no válido');
      const st = await stat(join(dir, nombre)).catch(() => null);
      if (!st?.isFile()) throw new NotFoundException('Respaldo no encontrado');
    }
    const ahora = Date.now();
    for (const [k, v] of this.enlaces) if (v.vence < ahora) this.enlaces.delete(k);
    const token = randomBytes(24).toString('hex');
    this.enlaces.set(token, { tipo: nombre ? 'archivo' : 'directo', nombre, usuario: u, vence: ahora + 2 * 60_000 });
    return { url: `/api/respaldos/descarga/${token}` };
  }

  /** Consume el enlace (un solo uso, 2 minutos). */
  usarEnlace(token: string) {
    const e = this.enlaces.get(token);
    this.enlaces.delete(token);
    if (!e || e.vence < Date.now()) throw new NotFoundException('El enlace de descarga venció o ya se usó; vuelve a pulsar Descargar');
    return e;
  }

  /**
   * Respaldo completo generado al momento y enviado al navegador sin guardarlo en el servidor:
   * un .tar con bd_<fecha>.dump y adjuntos_<fecha>.tgz (los mismos archivos que usa restaurar.sh).
   */
  async directo(u: UsuarioSesion, res: Response) {
    const { fecha } = this.sello();
    const tmp = await mkdtemp(join(tmpdir(), 'respaldo-'));
    const bd = `bd_${fecha}.dump`;
    const adj = `adjuntos_${fecha}.tgz`;
    try {
      await ejecutar('pg_dump', ['-F', 'c', '-f', join(tmp, bd)], this.envPg());
      await ejecutar('tar', ['czf', join(tmp, adj), '-C', this.uploads, '.'], process.env);
    } catch (e) {
      await rm(tmp, { recursive: true, force: true });
      throw new ServiceUnavailableException(`No se pudo generar el respaldo: ${e instanceof Error ? e.message : e}`);
    }
    const [sb, sa] = await Promise.all([stat(join(tmp, bd)), stat(join(tmp, adj))]);
    // Sin Content-Length: el tamaño final del .tar depende del relleno de bloques de tar
    await this.bitacora.registrar({ accion: 'RESPALDO_DESCARGA_DIRECTA', modulo: 'CONFIG', detalle: `respaldo_ST-OBRAS_${fecha}.tar`, usuarioId: u.id });
    res.set({
      'Content-Type': 'application/x-tar',
      'Content-Disposition': `attachment; filename="respaldo_ST-OBRAS_${fecha}.tar"`,
      'X-Respaldo-Bytes': String(sb.size + sa.size),
    });
    const p = spawn('tar', ['cf', '-', '-C', tmp, bd, adj], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.pipe(res);
    const limpiar = () => void rm(tmp, { recursive: true, force: true });
    p.on('close', limpiar);
    res.on('close', () => { if (p.exitCode === null) p.kill(); });
  }

  async resumen() {
    const dir = this.dir;
    const base = { horario: { cron: this.cron, texto: describirCron(this.cron), zona: 'hora de Ecuador' }, estado: this.estado };
    if (!dir) return { ...base, configurado: false, respaldos: [], total: 0, tamanoTotal: 0, log: [], disco: null };
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    const nombres = await readdir(dir).catch(() => [] as string[]);
    const grupos = new Map<string, { fecha: string; bd?: { nombre: string; bytes: number }; adjuntos?: { nombre: string; bytes: number } }>();
    let tamanoTotal = 0;
    for (const n of nombres) {
      const m = NOMBRE_VALIDO.exec(n);
      if (!m) continue;
      const st = await stat(join(dir, n)).catch(() => null);
      if (!st) continue;
      tamanoTotal += st.size;
      const g = grupos.get(m[2]) ?? { fecha: m[2] };
      g[m[1] as 'bd' | 'adjuntos'] = { nombre: n, bytes: st.size };
      grupos.set(m[2], g);
    }
    const respaldos = [...grupos.values()]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((g) => {
        const [d, h] = g.fecha.split('_');
        return { ...g, momento: `${d}T${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6) || '00'}` };
      });
    const log = (await readFile(join(dir, 'respaldo.log'), 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .slice(-15)
      .reverse();
    let disco: { libreBytes: number; totalBytes: number; librePct: number } | null = null;
    try {
      const s = await statfs(dir);
      disco = { libreBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize, librePct: Math.round((s.bavail / s.blocks) * 100) };
    } catch {
      disco = null;
    }
    return { ...base, configurado: true, respaldos: respaldos.slice(0, 60), total: respaldos.length, tamanoTotal, log, disco };
  }

  /** Inicia un respaldo manual en segundo plano; el avance se consulta con resumen(). */
  iniciar(u: UsuarioSesion) {
    const dir = this.exigirDir();
    if (this.estado.enCurso) throw new ConflictException('Ya hay un respaldo en curso; espera a que termine');
    this.estado = { ...this.estado, enCurso: true, inicio: new Date().toISOString(), usuario: u.nombre };
    void this.respaldar(dir, u);
    return this.estado;
  }

  private async respaldar(dir: string, u: UsuarioSesion) {
    const ahora = new Date(Date.now() - 5 * 3600_000); // Ecuador, UTC-5 todo el año
    let fecha = ahora.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
    const tmpBd = join(dir, `.bd_${fecha}.${process.pid}.tmp`);
    const tmpAdj = join(dir, `.adjuntos_${fecha}.${process.pid}.tmp`);
    const linea = (t: string) => appendFile(join(dir, 'respaldo.log'), `${ahora.toISOString().slice(0, 19).replace('T', ' ')} ${t}\n`).catch(() => undefined);
    try {
      await mkdir(dir, { recursive: true });
      const env = this.envPg();
      await ejecutar('pg_dump', ['-F', 'c', '-f', tmpBd], env);
      await ejecutar('tar', ['czf', tmpAdj, '-C', resolve(this.config.get<string>('UPLOAD_DIR', './uploads')), '.'], env);
      const [sb, sa] = await Promise.all([stat(tmpBd), stat(tmpAdj)]);
      if (!sb.size || !sa.size) throw new Error('el respaldo quedó vacío');
      if (await stat(join(dir, `bd_${fecha}.dump`)).catch(() => null)) fecha = `${fecha}_${process.pid}`;
      await rename(tmpBd, join(dir, `bd_${fecha}.dump`));
      await rename(tmpAdj, join(dir, `adjuntos_${fecha}.tgz`));
      const mb = (b: number) => `${(b / 1048576).toFixed(1)}M`;
      await linea(`OK bd=${mb(sb.size)} adjuntos=${mb(sa.size)} (manual: ${u.nombre})`);
      await this.bitacora.registrar({ accion: 'RESPALDO_MANUAL', modulo: 'CONFIG', detalle: `Respaldo manual ${fecha}`, usuarioId: u.id });
      this.estado = { enCurso: false, ultimo: { fin: new Date().toISOString(), ok: true, mensaje: `Respaldo ${fecha} guardado`, usuario: u.nombre } };
    } catch (e) {
      await rm(tmpBd, { force: true });
      await rm(tmpAdj, { force: true });
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`Respaldo manual fallido: ${msg}`);
      await linea(`ERROR: ${msg} (manual: ${u.nombre})`);
      this.estado = { enCurso: false, ultimo: { fin: new Date().toISOString(), ok: false, mensaje: msg, usuario: u.nombre } };
    }
  }

  async archivo(u: UsuarioSesion, nombre: string) {
    const dir = this.exigirDir();
    if (!NOMBRE_VALIDO.test(nombre)) throw new BadRequestException('Nombre de respaldo no válido');
    const ruta = join(dir, nombre);
    const st = await stat(ruta).catch(() => null);
    if (!st?.isFile()) throw new NotFoundException('Respaldo no encontrado');
    await this.bitacora.registrar({ accion: 'RESPALDO_DESCARGADO', modulo: 'CONFIG', detalle: nombre, usuarioId: u.id });
    return { ruta, bytes: st.size };
  }
}

export class EnlaceRespaldoDto {
  @IsOptional() @IsString() @MaxLength(80) nombre?: string;
}

@Controller('respaldos')
export class RespaldosController {
  constructor(private readonly s: RespaldosService) {}

  @Get()
  @Permisos('respaldos.gestionar')
  resumen() {
    return this.s.resumen();
  }

  @Post()
  @Permisos('respaldos.gestionar')
  iniciar(@CurrentUser() u: UsuarioSesion) {
    return this.s.iniciar(u);
  }

  /** Crea un enlace de descarga de un solo uso: con `nombre`, un respaldo guardado; sin él, un respaldo directo. */
  @Post('enlace')
  @Permisos('respaldos.gestionar')
  enlace(@Body() dto: EnlaceRespaldoDto, @CurrentUser() u: UsuarioSesion) {
    return this.s.crearEnlace(u, dto.nombre);
  }

  /** Descarga por enlace de un solo uso (sin sesión en la URL; el enlace ya fue autorizado y vence en 2 min). */
  @Public()
  @Get('descarga/:token')
  async descarga(@Param('token') token: string, @Res() res: Response) {
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException('Enlace no válido');
    const e = this.s.usarEnlace(token);
    if (e.tipo === 'directo') return this.s.directo(e.usuario, res);
    const { ruta, bytes } = await this.s.archivo(e.usuario, e.nombre!);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${e.nombre}"`, 'Content-Length': String(bytes) });
    createReadStream(ruta).pipe(res);
  }
}

@Module({ controllers: [RespaldosController], providers: [RespaldosService] })
export class RespaldosModule {}

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

/**
 * Requiere la BD levantada con 01_schema.sql + 02_seed.sql
 * (admin@stinnova.com / Cambiar123!). Correr con: npm run test:e2e
 */
describe('Auth y usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza peticiones sin token', () => {
    return request(app.getHttpServer()).get('/api/usuarios').expect(401);
  });

  it('rechaza credenciales inválidas', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@stinnova.com', password: 'incorrecta' })
      .expect(401);
  });

  it('inicia sesión con el admin del seed', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@stinnova.com', password: 'Cambiar123!' })
      .expect(200);

    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.usuario.roles).toContain('SUPERADMIN');
    token = res.body.accessToken;
  });

  it('lista usuarios sin exponer el hash de la contraseña', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.total).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('valida el cuerpo al crear un usuario', () => {
    return request(app.getHttpServer())
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X', email: 'no-es-email', password: '123' })
      .expect(400);
  });
});

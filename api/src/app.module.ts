import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { middlewareContexto } from './common/contexto.js';
import { BitacoraConsultaModule } from './bitacora/bitacora.module.js';
import { ReportesModule } from './reportes/reportes.module.js';
import { CosteoModule } from './costeo/costeo.module.js';
import { AccesosModule } from './accesos/accesos.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { ArchivosModule } from './archivos/archivos.module.js';
import { MigracionesModule } from './common/migraciones.js';
import { BitacoraModule } from './common/bitacora.service.js';
import { CatalogosModule } from './catalogos/catalogos.controller.js';
import { ObrasModule } from './obras/obras.module.js';
import { FirmasModule } from './firmas/firmas.service.js';
import { ContratistasModule } from './contratistas/contratistas.module.js';
import { CatalogoModule } from './catalogo/catalogo.module.js';
import { BodegaModule } from './bodega/bodega.module.js';
import { PlanillasModule } from './planillas/planillas.module.js';
import { AvancesModule } from './avances/avances.module.js';
import { ProgramaModule } from './programa/programa.module.js';
import { RubrosModule } from './rubros/rubros.module.js';
import { HabilitacionModule } from './habilitacion/habilitacion.controller.js';
import { DbExceptionFilter } from './common/db-exception.filter.js';
import { JwtAuthGuard } from './common/jwt-auth.guard.js';
import { PermisosGuard } from './common/permisos.guard.js';
import { HealthController } from './health.controller.js';
import { RolesModule } from './roles/roles.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres',
        host: c.get('DB_HOST', 'localhost'),
        port: Number(c.get('DB_PORT', 5432)),
        username: c.getOrThrow<string>('DB_USER'),
        password: c.getOrThrow<string>('DB_PASSWORD'),
        database: c.getOrThrow<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false, // el esquema lo manda db/init/01_schema.sql, no TypeORM
      }),
    }),
    MigracionesModule,
    ArchivosModule,
    BitacoraModule,
    AuthModule,
    UsuariosModule,
    RolesModule,
    CatalogosModule,
    ObrasModule,
    FirmasModule,
    ContratistasModule,
    HabilitacionModule,
    RubrosModule,
    AvancesModule,
    ProgramaModule,
    BodegaModule,
    PlanillasModule,
    CatalogoModule,
    BitacoraConsultaModule,
    ReportesModule,
    CosteoModule,
    AccesosModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // todo protegido salvo @Public()
    { provide: APP_GUARD, useClass: PermisosGuard },
    { provide: APP_FILTER, useClass: DbExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(middlewareContexto).forRoutes('{*ruta}');
  }
}

import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    UsuariosModule,
    JwtModule.registerAsync({
      global: true, // JwtAuthGuard (global) también lo necesita
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const secret = c.getOrThrow<string>('JWT_SECRET');
        if (secret.length < 32 || secret.startsWith('cambia-esto')) {
          new Logger('AuthModule').warn(
            'JWT_SECRET es débil o es el valor de ejemplo: cámbialo antes de producción',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: Number(c.get('JWT_EXPIRES_IN_SECONDS', 28800)),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

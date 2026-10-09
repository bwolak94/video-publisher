import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { JwksController } from './jwks.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { configuration } from '../config/configuration';

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const config = configuration();
        const publicKey = config.jwt?.publicKey;

        if (!publicKey && process.env['NODE_ENV'] === 'production') {
          throw new Error(
            'JWT_PUBLIC_KEY must be configured in production. Set it via environment variable.',
          );
        }

        if (!publicKey) {
          console.warn(
            '[AUTH] WARNING: JWT_PUBLIC_KEY not set — using insecure HS256 fallback. DO NOT use in production.',
          );
        }

        return {
          publicKey: publicKey || undefined,
          algorithms: publicKey ? (['RS256'] as any) : (['HS256'] as any),
          // For own token issuance (register/login/refresh)
          secret: process.env['AUTH_SECRET'] ?? 'changeme-dev-secret',
          verifyOptions: {
            audience: process.env['JWT_AUDIENCE'] ?? 'core-backend',
            issuer: process.env['JWT_ISSUER'] ?? '',
          },
          signOptions: {
            expiresIn: process.env['AUTH_ACCESS_EXPIRES'] ?? '15m',
          },
        };
      },
    }),
  ],
  controllers: [JwksController, AuthController],
  providers: [AuthGuard, JwtAuthGuard, AuthService],
  exports: [AuthGuard, JwtModule, JwtAuthGuard],
})
export class AuthModule {}

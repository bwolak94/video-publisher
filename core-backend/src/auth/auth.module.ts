import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthGuard } from "./auth.guard";
import { JwksController } from "./jwks.controller";
import { configuration } from "../config/configuration";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const config = configuration();
        const publicKey = config.jwt?.publicKey;

        if (!publicKey && process.env.NODE_ENV === "production") {
          throw new Error(
            "JWT_PUBLIC_KEY must be configured in production. Set it via environment variable.",
          );
        }

        if (!publicKey) {
          console.warn(
            "[AUTH] WARNING: JWT_PUBLIC_KEY not set — using insecure HS256 fallback. DO NOT use in production.",
          );
        }

        return {
          publicKey: publicKey || "test-secret",
          algorithms: publicKey ? ["RS256"] : ["HS256"],
          verifyOptions: {
            audience: process.env.JWT_AUDIENCE ?? "core-backend",
            issuer: process.env.JWT_ISSUER ?? "",
          },
        };
      },
    }),
  ],
  controllers: [JwksController],
  providers: [AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}

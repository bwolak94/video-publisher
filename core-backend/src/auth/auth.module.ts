import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthGuard } from "./auth.guard";
import { configuration } from "../config/configuration";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const config = configuration();
        // RS256: verify with public key
        return {
          publicKey: config.jwt.publicKey || "test-secret",
          algorithms: config.jwt.publicKey ? ["RS256"] : ["HS256"],
        };
      },
    }),
  ],
  providers: [AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}

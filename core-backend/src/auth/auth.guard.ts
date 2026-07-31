import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Dev bypass: set AUTH_DISABLED=true in .env to skip JWT verification
    if (process.env.AUTH_DISABLED === "true") {
      const request = context.switchToHttp().getRequest();
      request.userId = "dev-user";
      request.user = { sub: "dev-user", roles: ["admin"] };
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException("Missing token");
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.userId = payload.sub;
      request.user = payload; // full JWT payload: sub, roles, tenant_id, etc.
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    return true;
  }

  private extractToken(request: any): string | null {
    const auth = request.headers?.authorization;
    if (auth?.startsWith("Bearer ")) {
      return auth.slice(7);
    }
    return null;
  }
}

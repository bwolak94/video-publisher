/**
 * Unit tests for AuthGuard — UT-07-04, UT-07-05, UT-07-06
 */
import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "./auth.guard";
import * as jwt from "jsonwebtoken";

const SECRET = "test-secret";
const USER_ID = "user-abc-123";

function makeValidToken() {
  return jwt.sign({ sub: USER_ID }, SECRET, { expiresIn: "1h" });
}

function makeExpiredToken() {
  return jwt.sign({ sub: USER_ID }, SECRET, { expiresIn: -1 });
}

function makeInvalidSignatureToken() {
  return jwt.sign({ sub: USER_ID }, "wrong-secret", { expiresIn: "1h" });
}

function makeContext(token: string | null): ExecutionContext {
  const request: any = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    userId: undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

describe("AuthGuard", () => {
  let guard: AuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: SECRET }),
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  // UT-07-04: valid token → passes through, attaches userId
  it("valid token passes and attaches userId (UT-07-04)", async () => {
    const ctx = makeContext(makeValidToken());
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(ctx.switchToHttp().getRequest().userId).toBe(USER_ID);
  });

  // UT-07-05: expired token → 401
  it("expired token returns 401 (UT-07-05)", async () => {
    const ctx = makeContext(makeExpiredToken());
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // UT-07-06: invalid signature → 401
  it("invalid signature returns 401 (UT-07-06)", async () => {
    const ctx = makeContext(makeInvalidSignatureToken());
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("missing token returns 401", async () => {
    const ctx = makeContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});

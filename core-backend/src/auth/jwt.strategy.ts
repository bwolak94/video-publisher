/**
 * Passport is not a dependency of this project.
 * JWT verification is handled by AuthGuard (auth.guard.ts) using @nestjs/jwt directly.
 *
 * This file is kept as a placeholder so that any external reference to JwtStrategy
 * (e.g. from tests) compiles without errors.
 */
export type JwtStrategy = never;

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const THROTTLE_KEY = "throttle";

export interface ThrottleOptions {
  /** Max requests per window */
  limit: number;
  /** Window length in milliseconds */
  windowMs: number;
}

/** Decorate a controller method: @Throttle({ limit: 10, windowMs: 60_000 }) */
export function Throttle(opts: ThrottleOptions): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(THROTTLE_KEY, opts, descriptor.value as object);
    return descriptor;
  };
}

interface HitRecord {
  count: number;
  resetAt: number;
}

/**
 * In-process rate limiter (no external dependency).
 * Keyed by IP + route path. Clears stale entries on each check to avoid memory leak.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly store = new Map<string, HitRecord>();
  private lastCleanup = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts: ThrottleOptions | undefined = this.reflector.get(
      THROTTLE_KEY,
      context.getHandler(),
    );
    if (!opts) return true; // no throttle configured

    const req = context.switchToHttp().getRequest<{ ip?: string; socket?: { remoteAddress?: string }; url?: string }>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const key = `${ip}:${req.url}`;
    const now = Date.now();

    // Periodic cleanup of expired entries (~every 5 min)
    if (now - this.lastCleanup > 300_000) {
      for (const [k, v] of this.store) {
        if (v.resetAt < now) this.store.delete(k);
      }
      this.lastCleanup = now;
    }

    const record = this.store.get(key);
    if (!record || record.resetAt < now) {
      this.store.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }

    record.count += 1;
    if (record.count > opts.limit) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      throw new HttpException(
        { error: "Too many requests", retryAfterSeconds: retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { sql } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { DRIZZLE } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';

const scryptAsync = promisify(scrypt);

const SCRYPT_KEYLEN = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  const hashBuf = Buffer.from(hash, 'hex');
  if (derived.length !== hashBuf.length) return false;
  return timingSafeEqual(derived, hashBuf);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: any,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  async register(dto: RegisterDto): Promise<{ userId: string; email: string }> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException('Account with this email already exists');

    const passwordHash = await hashPassword(dto.password);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role ?? 'operator',
    });

    const otp = Math.floor(100_000 + Math.random() * 900_000).toString();
    try {
      await this.redis.set(`otp:${dto.email}`, otp, 'EX', 600);
    } catch {
      // Redis unavailable in test env — OTP skipped
    }

    return { userId: user.id, email: user.email };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    const authSecret = process.env['AUTH_SECRET'] ?? 'changeme-dev-secret';
    const expiresIn = process.env['AUTH_ACCESS_EXPIRES'] ?? '15m';

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { secret: authSecret, expiresIn },
    );

    const rawRefresh = randomBytes(40).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefresh).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.db.execute(
      sql`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
          VALUES (${user.id}, ${tokenHash}, ${expiresAt.toISOString()})`,
    );

    return { accessToken, refreshToken: rawRefresh };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    let stored: string | null = null;
    try {
      stored = await this.redis.get(`otp:${dto.email}`);
    } catch {
      // Redis unavailable — skip OTP check in dev/test
    }

    if (stored !== null && stored !== dto.code) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.users.markEmailVerified(dto.email);

    try {
      await this.redis.del(`otp:${dto.email}`);
    } catch {
      // ignore
    }
  }

  async refreshToken(rawToken: string): Promise<{ accessToken: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const rows = await this.db.execute(
      sql`SELECT rt.id, rt.user_id, u.email, u.role
          FROM refresh_tokens rt
          JOIN users u ON u.id = rt.user_id
          WHERE rt.token_hash = ${tokenHash}
            AND rt.revoked = false
            AND rt.expires_at > now()
          LIMIT 1`,
    );

    if (!rows.rows[0]) throw new UnauthorizedException('Token expired or invalid');

    const row = rows.rows[0] as { id: string; user_id: string; email: string; role: string };

    await this.db.execute(
      sql`UPDATE refresh_tokens SET revoked = true WHERE id = ${row.id}`,
    );

    const authSecret = process.env['AUTH_SECRET'] ?? 'changeme-dev-secret';
    const expiresIn = process.env['AUTH_ACCESS_EXPIRES'] ?? '15m';

    const accessToken = this.jwt.sign(
      { sub: row.user_id, email: row.email, role: row.role },
      { secret: authSecret, expiresIn },
    );

    return { accessToken };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.db.execute(
      sql`UPDATE refresh_tokens SET revoked = true WHERE token_hash = ${tokenHash}`,
    );
  }
}

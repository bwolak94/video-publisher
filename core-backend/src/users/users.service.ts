import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/db.module';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db.execute(
      sql`SELECT id, email, password_hash as "passwordHash", name, role,
                 email_verified as "emailVerified", created_at as "createdAt"
          FROM users WHERE email = ${email} LIMIT 1`,
    );
    return rows.rows[0] as User | undefined;
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role: string;
  }): Promise<User> {
    const rows = await this.db.execute(
      sql`INSERT INTO users (email, password_hash, name, role)
          VALUES (${data.email}, ${data.passwordHash}, ${data.name}, ${data.role})
          RETURNING id, email, password_hash as "passwordHash", name, role,
                    email_verified as "emailVerified", created_at as "createdAt"`,
    );
    return rows.rows[0] as User;
  }

  async markEmailVerified(email: string): Promise<void> {
    await this.db.execute(
      sql`UPDATE users SET email_verified = true WHERE email = ${email}`,
    );
  }
}

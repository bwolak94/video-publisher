/**
 * JwtAuthGuard — thin alias for the project-wide AuthGuard.
 * Provided in AuthModule so controllers can inject it by either class name.
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard {}

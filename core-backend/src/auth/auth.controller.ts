import { Controller, Post, Body, Res, Req, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const { accessToken, refreshToken } = await this.authService.login(dto);
    // Fastify cookie API
    res.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/auth',
    });
    return { accessToken };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: any) {
    const token: string | undefined = req.cookies?.['refresh_token'];
    if (!token) throw new Error('No refresh token');
    return this.authService.refreshToken(token);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const token: string | undefined = req.cookies?.['refresh_token'];
    if (token) await this.authService.logout(token);
    res.clearCookie('refresh_token', { path: '/api/auth' });
    return { ok: true };
  }
}

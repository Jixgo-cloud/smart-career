import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './decorators';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }, @Req() req: Request) {
    const ip = req.ip || 'local';
    return this.authService.loginAdmin(body?.email || '', body?.password || '', ip);
  }

  @Post('register')
  async register() {
    return this.authService.registerLocal();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user);
  }

  @Get('github')
  async githubStart(
    @Query('role') role: string,
    @Query('mode') mode: string,
    @Query('origin') origin: string,
    @Query('challenge') challenge: string,
    @Query('mockEmail') mockEmail: string,
    @Query('mockName') mockName: string,
    @Query('mockUsername') mockUsername: string,
    @Query('format') format: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.startOAuth({
      provider: 'GITHUB',
      role,
      mode,
      origin,
      challenge,
      ipKey: req.ip || 'local',
      mockEmail,
      mockName,
      mockUsername,
    });

    res.setHeader(
      'Set-Cookie',
      `smartcareer_oauth_binding=${encodeURIComponent(result.browserBinding)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );

    if (format === 'json') {
      return res.status(200).json(result);
    }
    return res.redirect(result.redirectUrl);
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('mockEmail') mockEmail: string,
    @Query('mockName') mockName: string,
    @Query('mockUsername') mockUsername: string,
    @Query('format') format: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const binding = cookies['smartcareer_oauth_binding'];
    const result = await this.authService.handleOAuthCallback({
      provider: 'GITHUB',
      code,
      state,
      browserBinding: binding,
      mockEmail,
      mockName,
      mockUsername,
    });

    if (format === 'json') {
      return res.status(200).json(result);
    }
    return res.redirect(result.redirectUrl);
  }

  @Get('google')
  async googleStart(
    @Query('role') role: string,
    @Query('mode') mode: string,
    @Query('origin') origin: string,
    @Query('challenge') challenge: string,
    @Query('mockEmail') mockEmail: string,
    @Query('mockName') mockName: string,
    @Query('format') format: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.startOAuth({
      provider: 'GOOGLE',
      role,
      mode,
      origin,
      challenge,
      ipKey: req.ip || 'local',
      mockEmail,
      mockName,
    });

    res.setHeader(
      'Set-Cookie',
      `smartcareer_oauth_binding=${encodeURIComponent(result.browserBinding)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );

    if (format === 'json') {
      return res.status(200).json(result);
    }
    return res.redirect(result.redirectUrl);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('mockEmail') mockEmail: string,
    @Query('mockName') mockName: string,
    @Query('format') format: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const binding = cookies['smartcareer_oauth_binding'];
    const result = await this.authService.handleOAuthCallback({
      provider: 'GOOGLE',
      code,
      state,
      browserBinding: binding,
      mockEmail,
      mockName,
    });

    if (format === 'json') {
      return res.status(200).json(result);
    }
    return res.redirect(result.redirectUrl);
  }

  @Post('oauth/exchange')
  async exchange(
    @Body() body: { code?: string; verifier?: string },
    @Headers('origin') origin: string,
    @Req() req: Request,
  ) {
    return this.authService.exchangeOAuthCode(
      body?.code || '',
      body?.verifier || '',
      origin,
      req.ip || 'local',
    );
  }
}

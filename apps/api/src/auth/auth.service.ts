import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { GitHubService } from '../github/github.service';
import { AuthSecurityService } from './auth-security.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly security: AuthSecurityService,
    private readonly githubService: GitHubService,
  ) {}

  async loginAdmin(emailInput: string, passwordInput: string, ipKey = 'unknown') {
    await this.security.checkRateLimit(`login:${ipKey}`, 10, 60);

    const email = (emailInput || '').trim().toLowerCase();
    const password = passwordInput || '';
    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        candidateProfile: true,
        companyMembers: { include: { company: true } },
      },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Local email/password login is restricted to ADMIN accounts. Candidates must sign in with GitHub and companies with Google.',
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.auditAdminAuth(user.id, 'AUTH_LOGIN_FAILED', { email: user.email, ip: ipKey });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const token = await this.signUserToken(user);
    await this.auditAdminAuth(user.id, 'AUTH_LOGIN', { email: user.email, ip: ipKey });
    return {
      user: this.formatUserResponse(user),
      token,
    };
  }

  /** Audit trail for admin authentication events. Never breaks the auth flow. */
  private async auditAdminAuth(userId: string, action: string, metadata: Record<string, unknown>) {
    try {
      await this.prisma.adminAuditLog.create({
        data: { actorId: userId, action, targetType: 'USER', targetId: userId, metadata: metadata as any },
      });
    } catch {}
  }

  async registerLocal() {
    throw new BadRequestException(
      'Direct email/password registration is disabled. Candidates must authenticate with GitHub OAuth and companies with Google OAuth.',
    );
  }

  async startOAuth(params: {
    provider: 'GITHUB' | 'GOOGLE';
    role?: string;
    mode?: string;
    origin?: string;
    challenge?: string;
    ipKey?: string;
    mockEmail?: string;
    mockName?: string;
    mockUsername?: string;
  }) {
    await this.security.checkRateLimit(`oauth-start:${params.ipKey || 'local'}`, 20, 60);

    const expectedRole = params.provider === 'GITHUB' ? 'CANDIDATE' : 'COMPANY';
    if (params.role && params.role.toUpperCase() !== expectedRole) {
      throw new ForbiddenException(
        `${params.provider} OAuth is only permitted for the ${expectedRole} role.`,
      );
    }

    const validatedOrigin = this.security.validateOrigin(params.origin);
    const challenge = (params.challenge || '').trim();
    if (!challenge || challenge.length < 16) {
      throw new BadRequestException('Valid PKCE challenge is required to start OAuth.');
    }

    const browserBinding = crypto.randomBytes(24).toString('hex');
    const state = await this.security.createOAuthState({
      provider: params.provider,
      role: expectedRole,
      mode: params.mode || 'login',
      origin: validatedOrigin,
      challenge,
      browserBindingHash: this.security.hashToken(browserBinding),
    });

    // Support dev/test mock callback when ENABLE_DEV_MOCK_AUTH=true and mock params or missing real credentials
    const isDevMock =
      process.env.ENABLE_DEV_MOCK_AUTH === 'true' &&
      (Boolean(params.mockEmail) ||
        (params.provider === 'GITHUB' &&
          (!process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID.startsWith('dev-'))) ||
        (params.provider === 'GOOGLE' &&
          (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.startsWith('dev-'))));

    if (isDevMock) {
      const callbackBase =
        params.provider === 'GITHUB'
          ? process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback'
          : process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback';

      const url = new URL(callbackBase);
      url.searchParams.set('code', 'dev-mock-oauth-code');
      url.searchParams.set('state', state);
      if (params.mockEmail) url.searchParams.set('mockEmail', params.mockEmail);
      if (params.mockName) url.searchParams.set('mockName', params.mockName);
      if (params.mockUsername) url.searchParams.set('mockUsername', params.mockUsername);

      return {
        redirectUrl: url.toString(),
        browserBinding,
        state,
      };
    }

    if (params.provider === 'GITHUB') {
      const clientId = process.env.GITHUB_CLIENT_ID || '';
      const callbackUrl =
        process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback';
      const ghUrl = new URL('https://github.com/login/oauth/authorize');
      ghUrl.searchParams.set('client_id', clientId);
      ghUrl.searchParams.set('redirect_uri', callbackUrl);
      ghUrl.searchParams.set('scope', 'read:user user:email');
      ghUrl.searchParams.set('state', state);
      return { redirectUrl: ghUrl.toString(), browserBinding, state };
    } else {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const callbackUrl =
        process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback';
      const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleUrl.searchParams.set('client_id', clientId);
      googleUrl.searchParams.set('redirect_uri', callbackUrl);
      googleUrl.searchParams.set('response_type', 'code');
      googleUrl.searchParams.set('scope', 'openid email profile');
      googleUrl.searchParams.set('state', state);
      return { redirectUrl: googleUrl.toString(), browserBinding, state };
    }
  }

  async handleOAuthCallback(params: {
    provider: 'GITHUB' | 'GOOGLE';
    code: string;
    state: string;
    browserBinding?: string;
    mockEmail?: string;
    mockName?: string;
    mockUsername?: string;
  }) {
    const statePayload = await this.security.consumeOAuthState(
      params.state,
      params.browserBinding,
    );

    if (statePayload.provider !== params.provider) {
      throw new ForbiddenException('OAuth provider mismatch.');
    }

    let userId: string;
    if (params.provider === 'GITHUB') {
      const profile = await this.resolveGitHubProfile(params);
      userId = await this.upsertCandidateFromGitHub(profile);
    } else {
      const profile = await this.resolveGoogleProfile(params);
      userId = await this.upsertCompanyFromGoogle(profile);
    }

    const exchangeCode = await this.security.createExchangeCode({
      userId,
      origin: statePayload.origin,
      challenge: statePayload.challenge,
    });

    const redirectUrl = `${statePayload.origin}/auth/callback?code=${encodeURIComponent(exchangeCode)}`;
    return { redirectUrl, exchangeCode };
  }

  private async resolveGitHubProfile(params: {
    code: string;
    mockEmail?: string;
    mockName?: string;
    mockUsername?: string;
  }): Promise<{
    providerId: string;
    email: string;
    name: string;
    username: string;
    avatarUrl?: string;
  }> {
    if (
      process.env.ENABLE_DEV_MOCK_AUTH === 'true' &&
      (params.code === 'dev-mock-oauth-code' || params.mockEmail || params.mockUsername)
    ) {
      const username = (params.mockUsername || 'demo-candidate').trim().toLowerCase();
      const email = (params.mockEmail || `${username}@github.smartcareer.local`)
        .trim()
        .toLowerCase();
      const name = params.mockName || `Candidate (${username})`;
      return {
        providerId: `gh-${username}`,
        email,
        name,
        username,
      };
    }

    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: params.code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: 'application/json' }, timeout: 15000 },
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('Failed to obtain GitHub access token.');
    }

    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });

    let email = userRes.data?.email;
    if (!email) {
      const emailsRes = await axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });
      const primary = (emailsRes.data || []).find((e: any) => e.primary && e.verified);
      email = primary?.email || `${userRes.data.login}@users.noreply.github.com`;
    }

    return {
      providerId: String(userRes.data.id),
      email: String(email).toLowerCase(),
      name: userRes.data.name || userRes.data.login,
      username: String(userRes.data.login),
      avatarUrl: userRes.data.avatar_url,
    };
  }

  private async resolveGoogleProfile(params: {
    code: string;
    mockEmail?: string;
    mockName?: string;
  }): Promise<{
    providerId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }> {
    if (
      process.env.ENABLE_DEV_MOCK_AUTH === 'true' &&
      (params.code === 'dev-mock-oauth-code' || params.mockEmail)
    ) {
      const email = (params.mockEmail || 'hr@technova.co.th').trim().toLowerCase();
      const name = params.mockName || 'TechNova Solutions Thailand';
      return {
        providerId: `google-${email}`,
        email,
        name,
      };
    }

    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: params.code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
      },
      { timeout: 15000 },
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('Failed to obtain Google access token.');
    }

    const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });

    return {
      providerId: String(userRes.data.sub),
      email: String(userRes.data.email).toLowerCase(),
      name: userRes.data.name || userRes.data.email,
      avatarUrl: userRes.data.picture,
    };
  }

  private async upsertCandidateFromGitHub(profile: {
    providerId: string;
    email: string;
    name: string;
    username: string;
    avatarUrl?: string;
  }): Promise<string> {
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { candidateProfile: true },
    });

    if (existingByEmail && existingByEmail.role !== UserRole.CANDIDATE) {
      throw new ForbiddenException(
        'This email is already registered under a different role and cannot sign in as CANDIDATE.',
      );
    }

    // Check if githubUsername is bound to another user
    const existingProfileByGh = await this.prisma.candidateProfile.findUnique({
      where: { githubUsername: profile.username },
    });

    if (
      existingProfileByGh &&
      existingByEmail &&
      existingProfileByGh.userId !== existingByEmail.id
    ) {
      throw new ForbiddenException('GitHub username is already linked to another candidate.');
    }

    if (existingByEmail) {
      if (!existingByEmail.candidateProfile) {
        await this.prisma.candidateProfile.create({
          data: {
            userId: existingByEmail.id,
            fullName: profile.name,
            githubUsername: profile.username,
            githubConnectedAt: new Date(),
            avatarUrl: profile.avatarUrl,
          },
        });
        await this.githubService
          .syncCandidateGitHub(existingByEmail.id, profile.username)
          .catch(() => {});
      } else {
        const repoCount = await this.prisma.gitHubRepository.count({
          where: { candidateId: existingByEmail.candidateProfile.id },
        });
        if (repoCount === 0 && profile.username) {
          await this.githubService
            .syncCandidateGitHub(existingByEmail.id, profile.username)
            .catch(() => {});
        }
      }
      return existingByEmail.id;
    }

    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        role: UserRole.CANDIDATE,
        authProvider: AuthProvider.GITHUB,
        providerId: profile.providerId,
        avatarUrl: profile.avatarUrl,
        isActive: true,
        candidateProfile: {
          create: {
            fullName: profile.name,
            githubUsername: profile.username,
            githubConnectedAt: new Date(),
            avatarUrl: profile.avatarUrl,
            targetCareer: 'Full Stack Developer',
          },
        },
      },
    });

    await this.githubService
      .syncCandidateGitHub(created.id, profile.username)
      .catch(() => {});

    return created.id;
  }

  private async upsertCompanyFromGoogle(profile: {
    providerId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }): Promise<string> {
    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { companyMembers: { include: { company: true } } },
    });

    if (existing && existing.role !== UserRole.COMPANY) {
      throw new ForbiddenException(
        'This email is already registered under a different role and cannot sign in as COMPANY.',
      );
    }

    if (existing) {
      if (existing.companyMembers.length === 0) {
        const slug = `company-${crypto.randomBytes(4).toString('hex')}`;
        const company = await this.prisma.company.create({
          data: {
            name: profile.name,
            slug,
            contactEmail: profile.email,
          },
        });
        await this.prisma.companyMember.create({
          data: {
            userId: existing.id,
            companyId: company.id,
            role: 'OWNER',
          },
        });
      }
      return existing.id;
    }

    const slug = `${profile.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'company'}-${crypto.randomBytes(3).toString('hex')}`;

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        role: UserRole.COMPANY,
        authProvider: AuthProvider.GOOGLE,
        providerId: profile.providerId,
        avatarUrl: profile.avatarUrl,
        isActive: true,
      },
    });

    const company = await this.prisma.company.create({
      data: {
        name: profile.name,
        slug,
        contactEmail: profile.email,
      },
    });

    await this.prisma.companyMember.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: 'OWNER',
      },
    });

    return user.id;
  }

  async exchangeOAuthCode(code: string, verifier: string, origin?: string, ipKey = 'local') {
    await this.security.checkRateLimit(`oauth-exchange:${ipKey}`, 20, 60);

    const payload = await this.security.consumeExchangeCode(code, verifier, origin);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        candidateProfile: true,
        companyMembers: { include: { company: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account not found or inactive.');
    }

    const token = await this.signUserToken(user);
    return {
      user: this.formatUserResponse(user),
      token,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        candidateProfile: true,
        companyMembers: { include: { company: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session invalid.');
    }

    return this.formatUserResponse(user);
  }

  async signUserToken(user: {
    id: string;
    email: string;
    role: UserRole;
    tokenVersion?: number;
  }) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion ?? 0,
    });
  }

  async logout(user: { id: string; role?: UserRole; email?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    if (updated.role === UserRole.ADMIN) {
      try {
        await this.prisma.adminAuditLog.create({
          data: {
            actorId: updated.id,
            action: 'AUTH_LOGOUT',
            targetType: 'USER',
            targetId: updated.id,
            metadata: { email: updated.email, tokenVersion: updated.tokenVersion },
          },
        });
      } catch {}
    }
    return { ok: true };
  }

  formatUserResponse(user: any) {
    const companyMember = user.companyMembers?.[0] || null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      authProvider: user.authProvider,
      avatarUrl: user.avatarUrl || user.candidateProfile?.avatarUrl || null,
      isActive: user.isActive,
      candidateProfile: user.candidateProfile
        ? {
            id: user.candidateProfile.id,
            fullName: user.candidateProfile.fullName,
            headline: user.candidateProfile.headline,
            targetCareer: user.candidateProfile.targetCareer,
            githubUsername: user.candidateProfile.githubUsername,
          }
        : null,
      company: companyMember?.company
        ? {
            id: companyMember.company.id,
            name: companyMember.company.name,
            slug: companyMember.company.slug,
            verificationStatus: companyMember.company.verificationStatus,
            memberRole: companyMember.role,
          }
        : null,
    };
  }
}

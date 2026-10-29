const PKCE_VERIFIER_KEY = 'smartcareer_pkce_verifier';
const POST_LOGIN_REDIRECT_KEY = 'smartcareer_post_login_redirect';

function generateRandomVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

async function computeSha256Base64Url(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface StartOAuthOptions {
  provider: 'github' | 'google';
  role: 'CANDIDATE' | 'COMPANY';
  mode?: 'login' | 'register';
  returnTo?: string;
  mockEmail?: string;
  mockName?: string;
  mockUsername?: string;
}

export async function startOAuthFlow(
  providerOrParams: 'github' | 'google' | StartOAuthOptions,
  roleArg?: 'CANDIDATE' | 'COMPANY',
  mockOpts?: { mockEmail?: string; mockName?: string; mockUsername?: string; mode?: 'login' | 'register'; returnTo?: string },
) {
  const params: StartOAuthOptions =
    typeof providerOrParams === 'string'
      ? {
          provider: providerOrParams,
          role: roleArg || 'CANDIDATE',
          ...mockOpts,
        }
      : providerOrParams;

  const verifier = generateRandomVerifier(64);
  window.sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  if (params.returnTo) {
    window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, params.returnTo);
  }

  const challenge = await computeSha256Base64Url(verifier);
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
  ).replace(/\/+$/, '');

  const url = new URL(`${apiBase}/auth/${params.provider}`);
  url.searchParams.set('role', params.role);
  url.searchParams.set('mode', params.mode || 'login');
  url.searchParams.set('origin', window.location.origin);
  url.searchParams.set('challenge', challenge);

  if (params.mockEmail) url.searchParams.set('mockEmail', params.mockEmail);
  if (params.mockName) url.searchParams.set('mockName', params.mockName);
  if (params.mockUsername) url.searchParams.set('mockUsername', params.mockUsername);

  window.location.href = url.toString();
}

export function consumeStoredPkceVerifier(): string | null {
  const v = window.sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (v) {
    window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  }
  return v;
}

export const consumePkceVerifier = consumeStoredPkceVerifier;

export function consumePostLoginRedirect(): string | null {
  const r = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (r) {
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  }
  return r;
}

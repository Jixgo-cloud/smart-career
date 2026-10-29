import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE_NAME = 'smartcareer_session';

function getUpstreamBaseUrl(): string {
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000/api'
  ).replace(/\/+$/, '');
}

function getAllowedOrigins(req: NextRequest): Set<string> {
  const origins = new Set<string>();
  const reqOrigin = req.nextUrl.origin;
  if (reqOrigin) origins.add(reqOrigin);
  if (process.env.FRONTEND_URL) origins.add(process.env.FRONTEND_URL.trim());
  if (process.env.ALLOWED_ORIGINS) {
    for (const o of process.env.ALLOWED_ORIGINS.split(',')) {
      if (o.trim()) origins.add(o.trim());
    }
  }
  return origins;
}

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const subPath = (path || []).join('/');
  const method = req.method.toUpperCase();

  // Validate Origin for mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const originHeader = req.headers.get('origin');
    if (originHeader) {
      const allowed = getAllowedOrigins(req);
      if (!allowed.has(originHeader)) {
        return NextResponse.json(
          { message: 'Forbidden origin.' },
          { status: 403 },
        );
      }
    }
  }

  // Handle /api/auth/logout: revoke server-side tokenVersion first, then clear cookie
  if (method === 'POST' && subPath === 'auth/logout') {
    const existingToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (existingToken) {
      try {
        await fetch(`${getUpstreamBaseUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${existingToken}`,
            origin: req.headers.get('origin') || req.nextUrl.origin,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Ignore upstream errors during logout; still clear cookie
      }
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  const upstreamUrl = new URL(`${getUpstreamBaseUrl()}/${subPath}`);
  req.nextUrl.searchParams.forEach((val, key) => {
    upstreamUrl.searchParams.append(key, val);
  });

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }
  const origin = req.headers.get('origin') || req.nextUrl.origin;
  if (origin) {
    headers.set('origin', origin);
  }

  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    headers.set('authorization', `Bearer ${sessionToken}`);
  }

  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(method)) {
    const text = await req.text();
    if (text) body = text;
  }

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(120000),
    });

    const resContentType = upstreamRes.headers.get('content-type') || '';

    // Binary / CSV passthrough
    if (
      !resContentType.includes('application/json') &&
      (resContentType.includes('application/pdf') ||
        resContentType.includes('image/') ||
        resContentType.includes('text/csv'))
    ) {
      const arrayBuf = await upstreamRes.arrayBuffer();
      const outHeaders = new Headers();
      outHeaders.set('content-type', resContentType);
      const disp = upstreamRes.headers.get('content-disposition');
      if (disp) outHeaders.set('content-disposition', disp);
      return new NextResponse(arrayBuf, {
        status: upstreamRes.status,
        headers: outHeaders,
      });
    }

    const rawText = await upstreamRes.text();
    let jsonData: any = null;
    try {
      jsonData = rawText ? JSON.parse(rawText) : {};
    } catch {
      return new NextResponse(rawText, {
        status: upstreamRes.status,
        headers: { 'content-type': resContentType || 'text/plain' },
      });
    }

    // Intercept login or OAuth exchange to set HttpOnly session cookie and strip JWT token from JSON
    if (
      upstreamRes.ok &&
      (subPath === 'auth/login' || subPath === 'auth/oauth/exchange') &&
      jsonData &&
      typeof jsonData.token === 'string'
    ) {
      const token = jsonData.token;
      const { token: _removed, ...safePayload } = jsonData;
      const res = NextResponse.json(safePayload, { status: upstreamRes.status });
      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
      return res;
    }

    return NextResponse.json(jsonData, { status: upstreamRes.status });
  } catch (err: any) {
    return NextResponse.json(
      {
        message: 'Failed to reach upstream API service.',
        detail: err?.message || 'Upstream connection error',
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: any) {
  return handleProxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
  return handleProxy(req, ctx);
}

export async function PUT(req: NextRequest, ctx: any) {
  return handleProxy(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: any) {
  return handleProxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: any) {
  return handleProxy(req, ctx);
}

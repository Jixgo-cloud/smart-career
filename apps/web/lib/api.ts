export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = normalizedPath.startsWith('/api/')
    ? normalizedPath
    : `/api${normalizedPath}`;

  const headers = new Headers(options.headers || {});
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const msg =
        (Array.isArray(data?.message) ? data.message.join(', ') : data?.message) ||
        `Request failed with status ${res.status}`;
      throw new ApiError(msg, res.status, data);
    }
    return data as T;
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(text || `HTTP ${res.status}`, res.status, text);
  }
  return text as unknown as T;
}

export const apiFetch = apiRequest;

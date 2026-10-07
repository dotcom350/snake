const TOKEN_KEY = 'snakeAdminToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public issues: string[] = []
  ) {
    super(code);
  }
}

export const auth = {
  get token(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(value: string | null) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage disabled: the session lasts until reload.
    }
  },
  onLogout: () => {},
};

export async function api<T = unknown>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    headers['Content-Type'] = contentType;
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  if (res.status === 401 && path !== '/api/admin/login') {
    auth.token = null;
    auth.onLogout();
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'ERROR', data?.issues ?? []);
  return data as T;
}

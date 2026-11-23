// In-memory session token store (never persisted in localStorage or sessionStorage)
let authToken: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorizedHandler = handler;
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && onUnauthorizedHandler && !url.startsWith('/api/auth/')) {
    onUnauthorizedHandler();
  }
  return res;
}

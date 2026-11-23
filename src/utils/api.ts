import type { ERPDatabase } from '../types/erp';
import { executeLocalErpAction } from './erpEngine';

// In-memory session token store (never persisted in localStorage or sessionStorage)
let authToken: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

// Optional Cloud Firestore Mode handler for serverless/Vercel deployments
let cloudModeActive = false;
let cloudDbRef: ERPDatabase | null = null;
let cloudPersistFn: ((nextDb: ERPDatabase) => Promise<void>) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorizedHandler = handler;
}

export function enableCloudErpMode(
  initialDb: ERPDatabase,
  onPersist: (nextDb: ERPDatabase) => Promise<void>
) {
  cloudModeActive = true;
  cloudDbRef = initialDb;
  cloudPersistFn = onPersist;
}

export function updateCloudErpDb(nextDb: ERPDatabase) {
  if (cloudModeActive) {
    cloudDbRef = nextDb;
  }
}

export function disableCloudErpMode() {
  cloudModeActive = false;
  cloudDbRef = null;
  cloudPersistFn = null;
}

export function isCloudErpMode(): boolean {
  return cloudModeActive;
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (cloudModeActive && cloudDbRef && url.startsWith('/api/erp/')) {
    const method = (init.method || 'GET').toUpperCase();
    let body: unknown = {};
    if (typeof init.body === 'string' && init.body.trim()) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = {};
      }
    }

    const result = executeLocalErpAction(cloudDbRef, method, url, body);
    if (result.nextDb) {
      cloudDbRef = result.nextDb;
      if (cloudPersistFn) {
        try {
          await cloudPersistFn(result.nextDb);
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Cloud Firestore save failed',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

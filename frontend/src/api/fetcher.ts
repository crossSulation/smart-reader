const BASE = "/api";

let authToken = localStorage.getItem("token");

export function setAuthToken(token: string | null) {
  authToken = token;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function fetcher<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = Array.isArray(body.detail) ? body.detail.map((d: any) => d.msg).join("; ") : body.detail;
    throw new SWRError(msg || res.statusText, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class SWRError extends Error {
  status: number;
  body: any;
  constructor(msg: string, status: number, body: any) {
    super(msg);
    this.status = status;
    this.body = body;
  }
}

export const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
  dedupingInterval: 5000,
};

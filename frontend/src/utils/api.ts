/**
 * Detect the API base URL based on the runtime environment.
 *
 * - Dev mode (npm run dev): relative paths work via Vite proxy
 * - Tauri desktop: backend on localhost:8000
 * - Tauri Android/iOS: configure TAURI_API_BASE or default to localhost
 * - Production web: relative paths if frontend and backend are served from same origin
 */

let _baseUrl = "";

export function getApiBaseUrl(): string {
  if (_baseUrl) return _baseUrl;

  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;

  if (isTauri) {
    _baseUrl = "http://localhost:8000";
    return _baseUrl;
  }

  _baseUrl = "";
  return _baseUrl;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url: string = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  // If we have a base URL and the request is relative, prepend it
  if (base && url.startsWith("/")) {
    return fetch(base + url, init);
  }

  return fetch(input, init);
}

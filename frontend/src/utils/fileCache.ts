import { invoke } from "@tauri-apps/api/core";

// Check if running in Tauri desktop environment
let isDesktopCached: boolean | null = null;
async function isDesktop(): Promise<boolean> {
  if (isDesktopCached !== null) return isDesktopCached;
  try {
    isDesktopCached = await invoke<boolean>("is_desktop");
  } catch {
    isDesktopCached = false;
  }
  return isDesktopCached;
}

export async function fetchWithCache(url: string, token?: string): Promise<{ blob: Blob; cached: boolean }> {
  if (await isDesktop()) {
    return fetchWithCacheDesktop(url, token);
  }
  return fetchWithCacheBrowser(url, token);
}

// ── Tauri SQLite backend ──

async function fetchWithCacheDesktop(url: string, token?: string): Promise<{ blob: Blob; cached: boolean }> {
  try {
    const cached = await invoke<number[] | null>("get_cached_file", { url });
    if (cached && cached.length > 0) {
      return { blob: new Blob([new Uint8Array(cached)]), cached: true };
    }
  } catch {
    // Cache miss or error — fall through to network
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

  const buffer = await res.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));

  // Cache in background
  invoke("cache_file", { url, data }).catch(() => {});

  return { blob: new Blob([buffer]), cached: false };
}

export async function clearCache(): Promise<void> {
  if (await isDesktop()) {
    await invoke("clear_file_cache").catch(() => {});
    return;
  }
  await clearBrowserCache();
}

// ── IndexedDB fallback for browser ──

const DB_NAME = "smart-reader-cache";
const STORE_NAME = "book-files";
const META_STORE = "cache-meta";
const DB_VERSION = 2;
const MAX_CACHE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_SIZE = 30 * 1024 * 1024;

interface CacheEntry {
  url: string;
  size: number;
  cachedAt: number;
}

function openBrowserDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "url" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function fetchWithCacheBrowser(url: string, token?: string): Promise<{ blob: Blob; cached: boolean }> {
  try {
    const db = await openBrowserDb();
    const cached = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    if (cached) return { blob: cached, cached: true };
  } catch { /* fall through */ }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const blob = await res.blob();

  if (blob.size <= MAX_FILE_SIZE) {
    cacheBrowserFile(url, blob).catch(() => {});
  }

  return { blob, cached: false };
}

async function cacheBrowserFile(url: string, blob: Blob): Promise<void> {
  try {
    const db = await openBrowserDb();
    const metaEntries: CacheEntry[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    let totalSize = metaEntries.reduce((s, e) => s + e.size, 0);
    if (totalSize + blob.size > MAX_CACHE_SIZE) {
      metaEntries.sort((a, b) => a.cachedAt - b.cachedAt);
      for (const entry of metaEntries) {
        if (totalSize + blob.size <= MAX_CACHE_SIZE - 5 * 1024 * 1024) break;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
          tx.objectStore(STORE_NAME).delete(entry.url);
          tx.objectStore(META_STORE).delete(entry.url);
          tx.oncomplete = () => { totalSize -= entry.size; resolve(); };
          tx.onerror = () => reject(tx.error);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
      tx.objectStore(STORE_NAME).put(blob, url);
      tx.objectStore(META_STORE).put({ url, size: blob.size, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* best-effort */ }
}

async function clearBrowserCache(): Promise<void> {
  try {
    const db = await openBrowserDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ignore */ }
}

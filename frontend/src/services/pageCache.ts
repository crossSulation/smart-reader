const DB_NAME = "smart_reader_page_cache";
const DB_VERSION = 1;
const STORE_NAME = "pages";
const PRELOAD_COUNT = 2; // preload next 2 pages
const MAX_CACHE_PAGES = 50; // evict oldest if too many

interface CachedPage {
  key: string;
  bookId: string;
  page: number;
  data: any;
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function pageCacheKey(bookId: string, page: number): string {
  return `${bookId}__p${page}`;
}

export async function getCachedPage(bookId: string, page: number): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(pageCacheKey(bookId, page));
      req.onsuccess = () => {
        const entry = req.result as CachedPage | undefined;
        resolve(entry ? entry.data : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putCachedPage(bookId: string, page: number, data: any): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ key: pageCacheKey(bookId, page), bookId, page, data, cachedAt: Date.now() });

    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count > MAX_CACHE_PAGES) {
        evictOldest(db, count - MAX_CACHE_PAGES);
      }
    };
  } catch { /* ignore */ }
}

export async function preloadPages(bookId: string, currentPage: number, totalPages: number): Promise<void> {
  for (let i = 1; i <= PRELOAD_COUNT; i++) {
    const p = currentPage + i;
    if (p > totalPages) break;

    const cached = await getCachedPage(bookId, p);
    if (cached) continue;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/books/${bookId}/pages/${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        await putCachedPage(bookId, p, data);
      }
    } catch { /* ignore preload errors */ }
  }
}

export async function clearBookCache(bookId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const entries = allReq.result as CachedPage[];
      for (const e of entries) {
        if (e.bookId === bookId) store.delete(e.key);
      }
    };
  } catch { /* ignore */ }
}

function evictOldest(db: IDBDatabase, count: number) {
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("cachedAt");
  const cursorReq = index.openCursor(null, "next");
  let deleted = 0;
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor && deleted < count) {
      cursor.delete();
      deleted++;
      cursor.continue();
    }
  };
}

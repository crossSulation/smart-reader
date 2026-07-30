interface ChunkEntry {
  id: number;
  book_id: number;
  embedding: number[];
  snippet: string;
  page: number | null;
}

interface CacheData {
  version: number;
  chunks: ChunkEntry[];
  updatedAt: number;
}

const DB_NAME = "smart-reader-chunks";
const STORE_NAME = "chunks";
const CACHE_KEY = "embeddings_v1";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCache(): Promise<CacheData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function setCache(data: CacheData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(data, CACHE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function fetchChunkCache(): Promise<{ chunks: ChunkEntry[]; version: number } | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const res = await fetch("/api/books/chunks/embeddings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const chunks: ChunkEntry[] = (data.chunks || []).map((c: any) => ({
      ...c,
      embedding: typeof c.embedding === "string" ? JSON.parse(c.embedding) : c.embedding,
    }));

    await setCache({
      version: data.version || 1,
      chunks,
      updatedAt: Date.now(),
    });

    return { chunks, version: data.version || 1 };
  } catch {
    return null;
  }
}

export async function getCachedChunks(): Promise<ChunkEntry[]> {
  const cache = await getCache();
  return cache?.chunks ?? [];
}

export async function hasCache(): Promise<boolean> {
  return (await getCache()) !== null;
}

export type { ChunkEntry };

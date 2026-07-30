import { embedTexts, canUseLocalEmbedding } from "./localEmbedding";
import { getCachedChunks, fetchChunkCache, hasCache } from "./chunkCache";

export interface LocalSearchResult {
  book_id: number;
  title: string;
  author: string | null;
  file_type: string | null;
  score: number;
  snippet: string;
  chunk_page: number | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function localSearch(
  query: string,
  bookMetas: { id: number; title: string; author: string | null; file_type: string | null }[],
  topK = 10,
): Promise<LocalSearchResult[]> {
  if (!canUseLocalEmbedding()) throw new Error("local unavailable");

  // Ensure cache is loaded
  let chunks = await getCachedChunks();
  if (chunks.length === 0) {
    const data = await fetchChunkCache();
    if (!data) throw new Error("no chunks");
    chunks = data.chunks;
  }

  if (chunks.length === 0) return [];

  // Embed query locally
  const [queryVec] = await embedTexts([query]);

  // Score all chunks
  const scored = chunks.map((chunk) => ({
    score: cosineSimilarity(queryVec, chunk.embedding),
    chunk,
  }));

  scored.sort((a, b) => b.score - a.score);

  // Group by book, take best score + snippet per book
  const bookMetaMap = new Map(bookMetas.map((b) => [b.id, b]));
  const bookHits = new Map<number, { score: number; snippet: string; page: number | null }>();
  const seen = new Set<number>();

  for (const { score, chunk } of scored) {
    if (seen.size >= topK) break;
    if (!bookHits.has(chunk.book_id) || score > bookHits.get(chunk.book_id)!.score) {
      bookHits.set(chunk.book_id, { score, snippet: chunk.snippet, page: chunk.page });
    }
    if (!seen.has(chunk.book_id)) {
      seen.add(chunk.book_id);
    }
  }

  return Array.from(bookHits.entries()).map(([bookId, hit]) => {
    const meta = bookMetaMap.get(bookId);
    return {
      book_id: bookId,
      title: meta?.title ?? "Unknown",
      author: meta?.author ?? null,
      file_type: meta?.file_type ?? null,
      score: Math.round(hit.score * 10000) / 10000,
      snippet: hit.snippet,
      chunk_page: hit.page,
    };
  }).sort((a, b) => b.score - a.score);
}

export async function ensureChunkCache(): Promise<void> {
  const has = await hasCache();
  if (!has && canUseLocalEmbedding()) {
    fetchChunkCache().catch(() => {});
  }
}

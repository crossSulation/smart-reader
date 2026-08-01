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

interface ChunkCacheItem {
  id: number;
  book_id: number;
  embedding: number[];
  snippet: string;
  page: number | null;
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

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b\w+\b/g) ?? [];
}

function keywordScore(queryTokens: string[], chunkText: string): number {
  if (queryTokens.length === 0) return 0;
  const lower = chunkText.toLowerCase();
  let matches = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) matches++;
  }
  return matches / queryTokens.length;
}

export async function localSearch(
  query: string,
  bookMetas: { id: number; title: string; author: string | null; file_type: string | null }[],
  topK = 10,
): Promise<LocalSearchResult[]> {
  if (!canUseLocalEmbedding()) throw new Error("local unavailable");

  const qLower = query.toLowerCase();
  const bookMetaMap = new Map(bookMetas.map((b) => [b.id, b]));

  // Stage 1: title/author exact match (instant, always top)
  const titleMatches: LocalSearchResult[] = [];
  for (const book of bookMetas) {
    if (qLower && (book.title.toLowerCase().includes(qLower) || (book.author ?? "").toLowerCase().includes(qLower))) {
      titleMatches.push({
        book_id: book.id,
        title: book.title,
        author: book.author,
        file_type: book.file_type,
        score: book.title.toLowerCase().includes(qLower) ? 1.0 : 0.5,
        snippet: book.title,
        chunk_page: null,
      });
    }
  }

  let chunks = await getCachedChunks();
  if (chunks.length === 0) {
    const data = await fetchChunkCache();
    if (!data) {
      titleMatches.sort((a, b) => b.score - a.score);
      return titleMatches.slice(0, topK);
    }
    chunks = data.chunks;
  }

  if (chunks.length === 0) {
    titleMatches.sort((a, b) => b.score - a.score);
    return titleMatches.slice(0, topK);
  }

  const [queryVec] = await embedTexts([query]);
  const queryTokens = tokenize(query);

  // Stage 2: hybrid scoring (keyword + vector)
  const KW_WEIGHT = 0.3;
  const VEC_WEIGHT = 0.7;

  const scored = chunks.map((chunk: ChunkCacheItem) => {
    const vecScore = cosineSimilarity(queryVec, chunk.embedding);
    const kwScore = keywordScore(queryTokens, chunk.snippet);
    const hybridScore = KW_WEIGHT * kwScore + VEC_WEIGHT * vecScore;
    return { score: hybridScore, chunk };
  });

  scored.sort((a, b) => b.score - a.score);

  // Stage 3: group by book, keep best chunk per book
  const seenBooks = new Set(titleMatches.map((t) => t.book_id));
  const bookHits = new Map<number, { score: number; snippet: string; page: number | null }>();

  for (const { score, chunk } of scored) {
    if (seenBooks.has(chunk.book_id)) continue;
    if (!bookHits.has(chunk.book_id) || score > bookHits.get(chunk.book_id)!.score) {
      bookHits.set(chunk.book_id, { score, snippet: chunk.snippet, page: chunk.page });
    }
  }

  // Stage 4: build results
  const semanticResults = Array.from(bookHits.entries()).map(([bookId, hit]) => {
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

  return [...titleMatches, ...semanticResults]
    .filter((r) => r.score >= 0.5)
    .slice(0, topK);
}

export async function ensureChunkCache(): Promise<void> {
  const has = await hasCache();
  if (!has && canUseLocalEmbedding()) {
    fetchChunkCache().catch(() => {});
  }
}

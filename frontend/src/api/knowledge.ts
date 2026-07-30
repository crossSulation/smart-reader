import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { KnowledgePointItem } from "../types/KnowledgeGraph";

export function useKnowledgePoints(bookId: string | number | null) {
  return useSWR<KnowledgePointItem[]>(
    bookId ? `/knowledge/points?book_id=${bookId}&limit=50` : null,
    fetcher,
  );
}

export function useKnowledgePointsQuery(params: {
  bookId?: number | null;
  search?: string;
  entityFilter?: string;
  limit?: number;
}) {
  const { bookId, search, entityFilter, limit = 100 } = params;
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (entityFilter) q.set("entity_type", entityFilter);
  if (bookId) q.set("book_id", String(bookId));
  q.set("limit", String(limit));

  return useSWR<KnowledgePointItem[]>(
    q.toString() ? `/knowledge/points?${q.toString()}` : null,
    fetcher,
  );
}

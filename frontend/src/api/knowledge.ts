import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { KnowledgePointItem } from "../types/KnowledgeGraph";

export function useKnowledgePoints(bookId: string | number | null) {
  return useSWR<KnowledgePointItem[]>(
    bookId ? `/knowledge/points?book_id=${bookId}&limit=50` : null,
    fetcher,
  );
}

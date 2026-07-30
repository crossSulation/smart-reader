import useSWR from "swr";
import { fetcher } from "./fetcher";

type ReviewItem = {
  id: number;
  flashcard_id: number;
  due_at: string;
  interval_days: number;
  ease_factor: number;
  reps: number;
  last_rating: string | null;
  flashcard_front: string;
  flashcard_back: string;
  book_id: number;
};

type NoteItem = {
  id: number;
  book_id: number;
  content: string;
  page: number | null;
  tags: string[];
  created_at: string;
};

export function useReviewDue(activeTopic?: string, activeBookId?: number | null) {
  const params = new URLSearchParams({ limit: "50" });
  if (activeTopic) params.set("tag", activeTopic);
  if (activeBookId) params.set("book_id", String(activeBookId));

  return useSWR<ReviewItem[]>(
    `/learning/review/due?${params.toString()}`,
    fetcher,
  );
}

export function useReviewNotes(activeTopic?: string, activeBookId?: number | null) {
  const params = new URLSearchParams({ limit: "100" });
  if (activeTopic) params.set("tag", activeTopic);
  if (activeBookId) params.set("book_id", String(activeBookId));

  return useSWR<NoteItem[]>(
    `/learning/notes?${params.toString()}`,
    fetcher,
  );
}

export async function rateReviewItem(itemId: number, rating: string) {
  return fetcher(`/learning/review/${itemId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
}

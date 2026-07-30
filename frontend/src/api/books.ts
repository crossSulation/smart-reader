import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "./fetcher";
import type { Book } from "../types/Book";

export function useBooks() {
  return useSWR<Book[]>("/books/", fetcher);
}

export function useBook(bookId: string | number | undefined) {
  return useSWR<Book>(bookId ? `/books/${bookId}` : null, fetcher);
}

export function useSharedBooks() {
  return useSWR<{ share_id: number; book_id: number; title: string; owner_username: string; created_at: string }[]>(
    "/books/shared-with-me",
    fetcher,
  );
}

export function useBookShares(bookId: number | null) {
  return useSWR<{ id: number; username: string; created_at: string }[]>(
    bookId ? `/books/${bookId}/shares` : null,
    fetcher,
  );
}

export function useShareActions() {
  const { mutate } = useSWRConfig();

  const shareBook = async (bookId: number, username: string) => {
    await fetcher(`/books/${bookId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    mutate(`/books/${bookId}/shares`);
    mutate("/books/shared-with-me");
  };

  const unshareBook = async (bookId: number, shareId: number) => {
    await fetcher(`/books/${bookId}/shares/${shareId}`, { method: "DELETE" });
    mutate(`/books/${bookId}/shares`);
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) return [];
    return fetcher<{ id: number; username: string }[]>(`/auth/users/search?q=${encodeURIComponent(query)}`);
  };

  return { shareBook, unshareBook, searchUsers };
}

import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "./fetcher";
import type { AIPanelLearningNote } from "../components/AIPanel";

export function useNotes(bookId: string | null) {
  return useSWR<AIPanelLearningNote[]>(
    bookId ? `/learning/notes?book_id=${encodeURIComponent(bookId)}&limit=50` : null,
    fetcher,
  );
}

export function useNoteActions() {
  const { mutate } = useSWRConfig();

  const createNote = async (payload: {
    book_id: number;
    content: string;
    source_text?: string;
    page: number | null;
    tags: string[];
    knowledge_point_ids?: number[];
  }) => {
    const note = await fetcher<AIPanelLearningNote>("/learning/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    mutate((k) => typeof k === "string" && k.startsWith("/learning/notes"));
    return note;
  };

  const updateNote = async (noteId: number, payload: { content: string; tags: string[] }) => {
    await fetcher(`/learning/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    mutate((k) => typeof k === "string" && k.startsWith("/learning/notes"));
  };

  const deleteNote = async (noteId: number) => {
    await fetcher(`/learning/notes/${noteId}`, { method: "DELETE" });
    mutate((k) => typeof k === "string" && k.startsWith("/learning/notes"));
  };

  return { createNote, updateNote, deleteNote };
}

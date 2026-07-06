import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";

type ReviewRating = "again" | "hard" | "good" | "easy";
type ReviewTab = "flashcards" | "notes";

type DueReviewItem = {
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

type BookOption = { id: number; title: string };

const RATING_LABELS: Record<ReviewRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const RATING_COLORS: Record<ReviewRating, string> = {
  again: "bg-red-600 hover:bg-red-700",
  hard: "bg-amber-600 hover:bg-amber-700",
  good: "bg-blue-600 hover:bg-blue-700",
  easy: "bg-green-600 hover:bg-green-700",
};

function FlashCard({
  item,
  flipped,
  onFlip,
  submitting,
  onRate,
}: {
  item: DueReviewItem;
  flipped: boolean;
  onFlip: () => void;
  submitting: boolean;
  onRate: (rating: ReviewRating) => void;
}) {
  return (
    <article
      onClick={onFlip}
      className="rounded-lg border border-gray-200 bg-white shadow-sm cursor-pointer hover:shadow-md"
      style={{ perspective: "800px" }}
    >
      <div
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.5s ease",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: "160px",
        }}
      >
        <div className="p-4" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <div className="mb-2 text-xs text-gray-500">
            Book #{item.book_id} · Reps: {item.reps} · Ease: {item.ease_factor.toFixed(2)}
          </div>
          <p className="whitespace-pre-wrap text-base text-gray-900">{item.flashcard_front}</p>
          <p className="mt-3 text-xs text-gray-400 italic">Tap to reveal answer</p>
        </div>
        <div
          className="absolute inset-0 p-4"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="mb-2 text-xs text-gray-500">
            Book #{item.book_id} · Interval: {item.interval_days} day(s)
          </div>
          <p className="mb-4 whitespace-pre-wrap text-base text-gray-700">
            {item.flashcard_back || "(Empty answer)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RATING_LABELS) as ReviewRating[]).map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={(e) => { e.stopPropagation(); onRate(rating); }}
                disabled={submitting}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${RATING_COLORS[rating]}`}
              >
                {submitting ? "Saving..." : RATING_LABELS[rating]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function Review() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTopic = searchParams.get("topic") || null;
  const activeBookId = searchParams.get("book_id") ? Number(searchParams.get("book_id")) : null;
  const [tab, setTab] = useState<ReviewTab>("flashcards");
  const [items, setItems] = useState<DueReviewItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set());
  const [books, setBooks] = useState<BookOption[]>([]);

  const toggleFlip = (id: number) => {
    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadDueItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (activeTopic) params.set("tag", activeTopic);
      if (activeBookId) params.set("book_id", String(activeBookId));
      const res = await fetch(`/api/learning/review/due?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to load due cards");
      setItems(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review cards");
    } finally {
      setLoading(false);
    }
  }, [activeTopic, activeBookId]);

  useEffect(() => { loadDueItems(); }, [loadDueItems]);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (activeTopic) params.set("tag", activeTopic);
      if (activeBookId) params.set("book_id", String(activeBookId));
      const res = await fetch(`/api/learning/notes?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        const data: NoteItem[] = await res.json();
        setNotes(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    setNotesLoading(false);
  }, [activeTopic, activeBookId]);

  useEffect(() => { if (tab === "notes") loadNotes(); }, [tab, loadNotes]);

  useEffect(() => {
    fetch("/api/books/", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setBooks(data); })
      .catch(() => {});
  }, []);

  const rateItem = async (itemId: number, rating: ReviewRating) => {
    setSubmittingId(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/learning/review/${itemId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) throw new Error("Failed to rate card");
      setFlippedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{t("review.title", "Review")}</h1>
          <div className="flex rounded border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setTab("flashcards")}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                tab === "flashcards" ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >Flashcards</button>
            <button
              type="button"
              onClick={() => setTab("notes")}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                tab === "notes" ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >Notes</button>
          </div>
          {books.length > 0 && (
            <select
              value={activeBookId || ""}
              onChange={(e) => {
                const params = new URLSearchParams(searchParams);
                if (e.target.value) params.set("book_id", e.target.value);
                else params.delete("book_id");
                setSearchParams(params);
              }}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="">All Books</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeTopic && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {activeTopic}
              <button type="button" onClick={() => setSearchParams({})} className="ml-1 text-blue-500 hover:text-blue-800 dark:hover:text-blue-200">&times;</button>
            </span>
          )}
          <button type="button" onClick={loadDueItems} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            {t("review.refresh", "Refresh")}
          </button>
        </div>
      </div>

      {loading && <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">Loading due cards...</div>}
      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!loading && tab === "flashcards" && items.length === 0 && (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {t("review.empty", "No due cards right now. Great job!")}
        </div>
      )}

      {tab === "flashcards" && (
        <div className="space-y-4">
          {items.map((item) => (
            <FlashCard
              key={item.id}
              item={item}
              flipped={flippedIds.has(item.id)}
              onFlip={() => toggleFlip(item.id)}
              submitting={submittingId === item.id}
              onRate={(rating) => rateItem(item.id, rating)}
            />
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-3">
          {notesLoading ? (
            <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              No notes yet. Save notes while reading and they will appear here.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                onClick={() => note.page != null && navigate(`/reader/${note.book_id}?page=${note.page}`)}
                className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${note.page != null ? "cursor-pointer hover:shadow-md" : ""}`}
              >
                <p className="mb-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{note.content}</p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                  {!activeBookId && <span>Book #{note.book_id}</span>}
                  {note.page != null && <span>{activeBookId ? "Page" : "· Page"} {note.page}</span>}
                  {note.created_at && <span>· {new Date(note.created_at).toLocaleDateString()}</span>}
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      onClick={(e) => { e.stopPropagation(); setSearchParams({ topic: tag }); }}
                      className="cursor-pointer rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300"
                    >#{tag}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default Review;

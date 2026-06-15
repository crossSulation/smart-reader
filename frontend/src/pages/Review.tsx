import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

type ReviewRating = "again" | "hard" | "good" | "easy";

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
      className={`rounded-lg border border-gray-200 bg-white shadow-sm cursor-pointer hover:shadow-md`}
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
        {/* Front */}
        <div
          className="p-4"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="mb-2 text-xs text-gray-500">
            Book #{item.book_id} · Reps: {item.reps} · Ease: {item.ease_factor.toFixed(2)}
          </div>
          <p className="whitespace-pre-wrap text-base text-gray-900">{item.flashcard_front}</p>
          <p className="mt-3 text-xs text-gray-400 italic">Tap to reveal answer</p>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 p-4"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTopic = searchParams.get("topic") || null;
  const [items, setItems] = useState<DueReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set());

  const toggleFlip = (id: number) => {
    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const loadDueItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (activeTopic) params.set("tag", activeTopic);
      const res = await fetch(`/api/learning/review/due?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to load due cards (${res.status})`);
      }

      const data: DueReviewItem[] = await res.json();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review cards");
    } finally {
      setLoading(false);
    }
  }, [activeTopic]);

  useEffect(() => {
    loadDueItems();
  }, [loadDueItems]);

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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to rate card (${res.status})`);
      }

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("review.title", "Daily Review")}</h1>
        <div className="flex items-center gap-2">
          {activeTopic && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {activeTopic}
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className="ml-1 text-blue-500 hover:text-blue-800 dark:hover:text-blue-200"
              >
                &times;
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={loadDueItems}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("review.refresh", "Refresh")}
          </button>
        </div>
      </div>

      {loading && <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">Loading due cards...</div>}

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!loading && items.length === 0 && (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {t("review.empty", "No due cards right now. Great job!")}
        </div>
      )}

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
    </div>
  );
}

export default Review;

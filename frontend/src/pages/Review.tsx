import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

function Review() {
  const { t } = useTranslation();
  const [items, setItems] = useState<DueReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadDueItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/learning/review/due?limit=50", {
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
  }, []);

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
        <button
          type="button"
          onClick={loadDueItems}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t("review.refresh", "Refresh")}
        </button>
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
          <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs text-gray-500">
              Book #{item.book_id} · Reps: {item.reps} · Ease: {item.ease_factor.toFixed(2)} · Interval: {item.interval_days} day(s)
            </div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Front</h2>
            <p className="mb-4 whitespace-pre-wrap text-gray-900">{item.flashcard_front}</p>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Back</h3>
            <p className="mb-4 whitespace-pre-wrap text-gray-700">{item.flashcard_back || "(Empty answer - edit later)"}</p>

            <div className="flex flex-wrap gap-2">
              {(["again", "hard", "good", "easy"] as const).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => rateItem(item.id, rating)}
                  disabled={submittingId === item.id}
                  className={`rounded px-3 py-1.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    rating === "again"
                      ? "bg-red-600 hover:bg-red-700"
                      : rating === "hard"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : rating === "good"
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {submittingId === item.id ? "Saving..." : rating}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default Review;

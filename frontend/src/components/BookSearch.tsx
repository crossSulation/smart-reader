import { useState, useCallback, useEffect, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SearchOutlined } from "@mui/icons-material";

type SearchResultItem = {
  chunk_id: number;
  chunk_index: number;
  text: string;
  page_start: number | null;
  page_end: number | null;
  section_path: string | null;
  score: number;
};

type BookSearchProps = {
  bookId: string;
  onJumpToPage?: (page: number) => void;
  isIndexing?: boolean;
  indexed?: boolean | null;
};

export default function BookSearch({ bookId, onJumpToPage, isIndexing = false, indexed: indexedProp = null }: BookSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexed, setIndexed] = useState<boolean | null>(indexedProp);

  // Fetch indexed status from backend on mount or when bookId changes
  useEffect(() => {
    const fetchIndexedStatus = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/indexed-status`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (res.ok) {
          const data = await res.json();
          setIndexed(data.indexed);
        }
      } catch (err) {
        console.error("Failed to fetch indexed status:", err);
      }
    };

    fetchIndexedStatus();
  }, [bookId]);

  // Update indexed state when isIndexing changes (for auto-indexing completion)
  useEffect(() => {
    if (isIndexing === false && indexed === null) {
      // Auto-indexing just completed, refresh status
      const fetchIndexedStatus = async () => {
        try {
          const res = await fetch(`/api/books/${bookId}/indexed-status`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          });
          if (res.ok) {
            const data = await res.json();
            setIndexed(data.indexed);
          }
        } catch (err) {
          console.error("Failed to fetch indexed status:", err);
        }
      };
      fetchIndexedStatus();
    }
  }, [isIndexing, bookId, indexed]);

  const handleIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/index`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Index failed (${res.status})`);
      }
      const result = await res.json();
      setIndexed(result.indexed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Index failed");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch(
        `/api/books/${bookId}/search?q=${encodeURIComponent(query)}&top_k=5`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      if (res.status === 422) {
        // Not indexed yet
        setIndexed(false);
        setError(t("search.notIndexed", "Book is not indexed yet. Click 'Index Book' first."));
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Search failed (${res.status})`);
      }
      const data: SearchResultItem[] = await res.json();
      setResults(data);
      if (data.length === 0) setError(t("search.noResults", "No results found."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [bookId, query, t]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50 mb-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <SearchOutlined fontSize="small" />
        {t("search.title", "Search in Book")}
      </h2>

      {/* Index trigger */}
      {isIndexing && (
        <div className="mb-3 flex items-center gap-3 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded p-2">
          <span className="inline-block animate-spin">⟳</span>
          <span>{t("search.autoIndexing", "Auto-indexing in progress…")}</span>
        </div>
      )}
      {indexed === false && !isIndexing && (
        <div className="mb-3 flex items-center gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          <span>{t("search.notIndexed", "Book not indexed yet.")}</span>
          <button
            onClick={handleIndex}
            disabled={loading}
            className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 text-xs"
          >
            {loading ? t("search.indexing", "Indexing…") : t("search.indexButton", "Index Book")}
          </button>
        </div>
      )}
      {indexed === true && (
        <div className="mb-3 flex items-center gap-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
          <span>✓</span>
          <span>{t("search.indexed", "Book is indexed and ready to search.")}</span>
        </div>
      )}

      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder", "Search passages…")}
          className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? "…" : t("search.searchButton", "Search")}
        </button>
        {indexed !== true && indexed === null && !isIndexing && (
          <button
            onClick={handleIndex}
            disabled={loading}
            className="px-3 py-2 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            title={t("search.indexTooltip", "Build search index for this book")}
          >
            {loading ? t("search.indexing", "Indexing…") : t("search.indexButton", "Index")}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <li
              key={r.chunk_id}
              className="bg-white border rounded p-3 text-sm hover:border-blue-400 transition"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-400">
                  {r.page_start !== null
                    ? `${t("search.page", "Page")} ${r.page_start}`
                    : `${t("search.chunk", "Chunk")} ${r.chunk_index + 1}`}
                  {r.section_path ? ` · ${r.section_path}` : ""}
                  {" · "}
                  <span className="text-green-600 font-medium">
                    {(r.score * 100).toFixed(1)}%
                  </span>
                </span>
                {r.page_start !== null && onJumpToPage && (
                  <button
                    onClick={() => onJumpToPage(r.page_start!)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {t("search.goToPage", "Go to page")}
                  </button>
                )}
              </div>
              <p className="text-gray-700 line-clamp-3">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

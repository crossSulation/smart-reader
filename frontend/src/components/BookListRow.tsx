import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeleteOutlineOutlined, ShareOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Book } from "../types/Book";

interface BookListRowProps {
  book: Book;
  onDelete: (id: number) => void;
  onShare: (book: Book) => void;
}

export default function BookListRow({ book, onDelete, onShare }: BookListRowProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [kpCount, setKpCount] = useState(book.knowledge_count ?? 0);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractDone, setExtractDone] = useState(false);
  const indexed = book.indexed ?? false;
  const fileType = (book.file_type || "").toLowerCase();
  const isEpub = fileType.includes("epub") || book.title.toLowerCase().endsWith(".epub");
  const isMarkdown = fileType.includes("markdown") || fileType === "md" ||
    book.title.toLowerCase().endsWith(".md") || book.title.toLowerCase().endsWith(".markdown");
  const progressText = isMarkdown ? "\u2014" : isEpub ? `${book.current_page ?? 0}%` : `${book.current_page || 0}`;
  const formattedLastRead = book.last_read_time
    ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(book.last_read_time))
    : null;

  const handleExtractKnowledge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExtracting(true);
    setExtractError(null);
    setExtractDone(false);
    try {
      const res = await fetch(`/api/books/${book.id}/extract-knowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.knowledge_points_extracted > 0) {
          setKpCount(data.knowledge_points_extracted);
        } else {
          setExtractDone(true);
          setTimeout(() => setExtractDone(false), 4000);
        }
      } else {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setExtractError(err.detail || 'Failed to extract knowledge points');
      }
    } catch {
      setExtractError('Network error. Please try again.');
    }
    setExtracting(false);
  };

  return (
    <div
      onClick={() => navigate(`/reader/${book.id}`)}
      className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:shadow-md transition dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="h-14 w-10 shrink-0 rounded bg-gray-100 flex items-center justify-center dark:bg-gray-800">
        {book.cover_path ? (
          <img src={book.cover_path} alt={book.title} className="h-full w-full object-cover rounded" />
        ) : (
          <span className="text-lg">📚</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold truncate text-sm text-gray-900 dark:text-gray-100">{book.title}</h3>
          {book.shared_by && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              Shared
            </span>
          )}
          {indexed && (
            <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">Indexed</span>
          )}
          {kpCount > 0 && (
            <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{kpCount} KP</span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {book.author || "unknown"}
          {book.shared_by && <span className="ml-2 text-blue-500">by @{book.shared_by}</span>}
        </p>
      </div>
      <div className="hidden sm:flex sm:flex-col sm:items-end shrink-0 text-xs text-gray-500 dark:text-gray-400 min-w-[80px]">
        <div>{t('bookCard.readingProgress')}: {progressText}</div>
        {formattedLastRead && <div>{formattedLastRead}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {indexed && kpCount === 0 && (
          <button
            type="button"
            onClick={handleExtractKnowledge}
            disabled={extracting}
            className="rounded border border-purple-300 bg-purple-50 px-2 py-1 text-[10px] font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-60 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
          >
            {extracting ? "Extracting..." : "Extract KP"}
          </button>
        )}
        {extractDone && <p className="text-[10px] text-amber-600">Already extracted</p>}
        {extractError && <p className="text-[10px] text-red-500">{extractError}</p>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(`/reader/${book.id}`); }}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition"
        >
          {t('bookCard.continueReading')}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(book.id); }}
          className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-400 hover:border-red-300 hover:text-red-500 dark:border-gray-600 dark:text-gray-500 dark:hover:border-red-400 dark:hover:text-red-400"
        >
          <DeleteOutlineOutlined sx={{ fontSize: 12 }} />
        </button>
        {!book.shared_by && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onShare(book); }}
            className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-400 hover:border-blue-300 hover:text-blue-500 dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-400 dark:hover:text-blue-400"
            title="Share"
          >
            <ShareOutlined sx={{ fontSize: 12 }} />
          </button>
        )}
      </div>
    </div>
  );
}

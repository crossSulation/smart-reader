import { useNavigate } from 'react-router-dom';
import { useState, type MouseEvent } from 'react';
import type { Book } from "../types/Book";
import { useTranslation } from 'react-i18next';
import { BoltOutlined, AutoAwesomeOutlined, DeleteOutlineOutlined } from '@mui/icons-material';

function BookCard({ book, onDelete }: { book: Book; onDelete?: (id: number) => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [kpCount, setKpCount] = useState(book.knowledge_count ?? 0);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractDone, setExtractDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const indexed = book.indexed ?? false;

  const fileType = (book.file_type || "").toLowerCase();
  const isEpub = fileType.includes("epub") || book.title.toLowerCase().endsWith(".epub");
  const isMarkdown = fileType.includes("markdown") || fileType === "md" ||
    book.title.toLowerCase().endsWith(".md") ||
    book.title.toLowerCase().endsWith(".markdown");

  const formatProgress = () => {
    if (isMarkdown) return "\u2014";
    if (isEpub) {
      const pct = book.current_page ?? 0;
      return `${pct}%`;
    }
    return book.current_page || 0;
  };

  const formattedLastRead = book.last_read_time
    ? new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(book.last_read_time))
    : null;

  const handleContinueClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    navigate(`/reader/${book.id}`);
  };

  const handleExtractKnowledge = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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

  const showExtractBtn = indexed && kpCount === 0;

  return (
    <div 
      onClick={() => navigate(`/reader/${book.id}`)}
      className="rounded-lg overflow-hidden hover:shadow-lg transition cursor-pointer border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 dark:hover:shadow-gray-900/40 hover:shadow-gray-200/60 shadow-sm"
    >
      <div className="h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        {book.cover_path ? (
          <img
            src={book.cover_path}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-4xl">📚</span>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-semibold truncate text-gray-900 dark:text-gray-100 flex-1">{book.title}</h3>
          <div className="flex shrink-0 items-center gap-1">
            {indexed && (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                <BoltOutlined sx={{ fontSize: 10 }} className="mr-0.5" />
                Indexed
              </span>
            )}
            {kpCount > 0 && (
              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                <AutoAwesomeOutlined sx={{ fontSize: 10 }} className="mr-0.5" />
                {kpCount} KP
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {book.author || "unknown"}
        </p>
        <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          <div>{t('bookCard.readingProgress')}: {formatProgress()}</div>
          {formattedLastRead && (
            <div>{t('bookCard.lastRead')}: {formattedLastRead}</div>
          )}
        </div>

        {showExtractBtn && (
          <button
            type="button"
            onClick={handleExtractKnowledge}
            disabled={extracting}
            className="mt-2 w-full rounded border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-60 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50"
          >
            {extracting ? "Extracting..." : "Extract Knowledge"}
          </button>
        )}
        {extractDone && (
          <p className="mt-1 text-[10px] text-amber-600">All knowledge points already extracted</p>
        )}
        {extractError && <p className="mt-1 text-[10px] text-red-500">{extractError}</p>}

        <button
          type="button"
          onClick={handleContinueClick}
          className="mt-2 w-full rounded bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          {t('bookCard.continueReading')}
        </button>

        {onDelete && (
          <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-700">
            {confirmDelete ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(book.id); setConfirmDelete(false); }}
                  className="flex-1 rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 transition"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="flex w-full items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-400 hover:border-red-300 hover:text-red-500 dark:border-gray-600 dark:text-gray-500 dark:hover:border-red-400 dark:hover:text-red-400"
              >
                <DeleteOutlineOutlined sx={{ fontSize: 12 }} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BookCard;

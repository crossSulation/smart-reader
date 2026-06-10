import { useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';
import type { Book } from "../types/Book";
import { useTranslation } from 'react-i18next';

function BookCard({ book }: { book: Book }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        <h3 className="font-semibold truncate text-gray-900 dark:text-gray-100">{book.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {book.author || "unknown"}
        </p>
        <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          <div>{t('bookCard.readingProgress')}: {book.current_page || 0}</div>
          {formattedLastRead && (
            <div>{t('bookCard.lastRead')}: {formattedLastRead}</div>
          )}
        </div>
        <button
          type="button"
          onClick={handleContinueClick}
          className="mt-4 w-full rounded bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          {t('bookCard.continueReading')}
        </button>
      </div>
    </div>
  );
}

export default BookCard;

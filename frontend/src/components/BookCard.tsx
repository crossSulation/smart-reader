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
      className="border rounded-lg overflow-hidden hover:shadow-lg transition cursor-pointer bg-white"
    >
      <div className="h-48 bg-gray-100 flex items-center justify-center">
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
        <h3 className="font-semibold truncate">{book.title}</h3>
        <p className="text-sm text-gray-500 truncate">
          {book.author || "unknown"}
        </p>
        <div className="mt-3 text-sm text-gray-500">
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

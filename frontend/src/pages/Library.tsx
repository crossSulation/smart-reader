import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { SortOutlined, GridViewOutlined, ViewListOutlined } from '@mui/icons-material';
import BookCard from "../components/BookCard";
import FileUpload from "../components/FileUpload";
import type { Book } from "../types/Book";
import NoBooks from "../components/NoBooks";

type SortOption = 'title' | 'author' | 'current_page' | 'date_added';
type SortOrder = 'asc' | 'desc';

function Library() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [books, setBooks] = useState<Book[]>([]);
  const searchQuery = searchParams.get('q') || '';
  const [sortBy, setSortBy] = useState<SortOption>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const hasFetchedRef = useRef(false);

  const fetchBooks = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/books/", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load books: ${res.status}`);
      }

      const data = await res.json();
      setBooks(data);
    } catch (error) {
      console.error("Failed to fetch books:", error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchBooks();
  }, [fetchBooks]);

  // Filter and sort books
  const filteredBooks = useMemo(() => {
    let result = books;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((book) => {
        const title = book.title?.toLowerCase() || "";
        const author = book.author?.toLowerCase() || "";
        return title.includes(query) || author.includes(query);
      });
    }

    // Sort books
    result = [...result].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'author':
          aValue = a.author?.toLowerCase() || '';
          bValue = b.author?.toLowerCase() || '';
          break;
        case 'current_page':
          aValue = a.current_page || 0;
          bValue = b.current_page || 0;
          break;
        case 'date_added':
          // Assuming books have a created_at or similar field, fallback to id for now
          aValue = a.id || '';
          bValue = b.id || '';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [books, searchQuery, sortBy, sortOrder]);

  if (loading) return <div className="flex-1 flex items-center justify-center">加载中...</div>;

  const BookListRow = ({ book }: { book: Book }) => {
    const fileType = (book.file_type || "").toLowerCase();
    const isEpub = fileType.includes("epub") || book.title.toLowerCase().endsWith(".epub");
    const isMarkdown = fileType.includes("markdown") || fileType === "md" ||
      book.title.toLowerCase().endsWith(".md") || book.title.toLowerCase().endsWith(".markdown");
    const progressText = isMarkdown ? "\u2014" : isEpub ? `${book.current_page ?? 0}%` : `${book.current_page || 0}`;
    const formattedLastRead = book.last_read_time
      ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(book.last_read_time))
      : null;

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
          <h3 className="font-semibold truncate text-sm text-gray-900 dark:text-gray-100">{book.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author || "unknown"}</p>
        </div>
        <div className="hidden sm:block shrink-0 text-xs text-gray-500 dark:text-gray-400 min-w-[80px] text-right">
          <div>{t('bookCard.readingProgress')}: {progressText}</div>
          {formattedLastRead && <div>{formattedLastRead}</div>}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(`/reader/${book.id}`); }}
          className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition"
        >
          {t('bookCard.continueReading')}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full px-8 py-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{t('library.pageTitle')}</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          aria-label="upload-book"
        >
          {t('library.uploadButton')}
        </button>
      </div>

      {/* Sort + View mode toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {searchQuery && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t('library.searchResults', { count: filteredBooks.length, query: searchQuery })}
          </div>
        )}
        <div className="flex-1" />
        {/* Sort */}
        <div className="flex items-center gap-2">
          <SortOutlined className="text-gray-400" fontSize="small" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="title">{t('library.sortBy.title')}</option>
            <option value="author">{t('library.sortBy.author')}</option>
            <option value="current_page">{t('library.sortBy.progress')}</option>
            <option value="date_added">{t('library.sortBy.dateAdded')}</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            aria-label="toggle-sort-order"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-gray-300 bg-white overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 transition ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}
            aria-label="grid-view"
            title="Grid"
          >
            <GridViewOutlined fontSize="small" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 transition ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}
            aria-label="list-view"
            title="List"
          >
            <ViewListOutlined fontSize="small" />
          </button>
        </div>
      </div>

      {showUpload && (
        <FileUpload
          onUploadComplete={() => {
            setShowUpload(false);
            fetchBooks();
          }}
          onClose={() => setShowUpload(false)}
        />
      )}

      {filteredBooks.length > 0 ? (
        <>
          {searchQuery && (
            <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Found {filteredBooks.length} result{filteredBooks.length !== 1 ? 's' : ''} for "{searchQuery}"
            </div>
          )}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {filteredBooks.map((book) => <BookCard key={book.id} book={book} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredBooks.map((book) => <BookListRow key={book.id} book={book} />)}
            </div>
          )}
        </>
      ) : books.length === 0 ? (
        <NoBooks onUploadClick={() => setShowUpload(true)} />
      ) : (
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <p className="text-gray-600 mb-4">No books found matching "{searchQuery}"</p>
            <button
              onClick={() => navigate('/library')}
              className="text-blue-600 hover:underline"
            >
              Clear search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Library;
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SearchOutlined, SortOutlined } from '@mui/icons-material';
import BookCard from "../components/BookCard";
import FileUpload from "../components/FileUpload";
import type { Book } from "../types/Book";
import NoBooks from "../components/NoBooks";

type SortOption = 'title' | 'author' | 'current_page' | 'date_added';
type SortOrder = 'asc' | 'desc';

function Library() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const res = await fetch("/api/books", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
  };

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

  if (loading) return <div className="p-8 text-center">加载中...</div>;

  return (
    <div className="p-8">
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

      {/* Search bar */}
      <div className="mb-8 flex items-center gap-3 max-w-md">
        <SearchOutlined className="text-gray-400" />
        <input
          type="text"
          placeholder={t('common.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-gray-500 hover:text-gray-700 px-2"
            aria-label="clear-search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Sort controls */}
      <div className="mb-6 flex items-center gap-4">
        <SortOutlined className="text-gray-400" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="title">{t('library.sortBy.title')}</option>
          <option value="author">{t('library.sortBy.author')}</option>
          <option value="current_page">{t('library.sortBy.progress')}</option>
          <option value="date_added">{t('library.sortBy.dateAdded')}</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="toggle-sort-order"
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
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
            <div className="mb-4 text-sm text-gray-600">
              Found {filteredBooks.length} result{filteredBooks.length !== 1 ? 's' : ''} for "{searchQuery}"
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {filteredBooks.map((book) => <BookCard key={book.id} book={book} />)}
          </div>
        </>
      ) : books.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <NoBooks onUploadClick={() => setShowUpload(true)} />
        </div>
      ) : (
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <p className="text-gray-600 mb-4">No books found matching "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery("")}
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
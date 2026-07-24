import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { SortOutlined, GridViewOutlined, ViewListOutlined, ArrowForwardOutlined, DeleteOutlineOutlined, SearchOffOutlined, LibraryBooksOutlined, ShareOutlined } from '@mui/icons-material';
import BookCard from "../components/BookCard";
import FileUpload from "../components/FileUpload";
import type { Book } from "../types/Book";
import NoBooks from "../components/NoBooks";
import { SkeletonGrid, SkeletonCard } from "../components/Skeleton";

type SortOption = 'title' | 'author' | 'current_page' | 'date_added';
type SortOrder = 'asc' | 'desc';
type GroupOption = 'none' | 'status';
type BookStatus = 'reading' | 'unread' | 'finished';

type SearchResultItem = {
  book_id: number;
  title: string;
  author: string | null;
  file_type: string | null;
  score: number;
  snippet: string;
  chunk_page: number | null;
};

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('library-view-mode');
    return saved === 'list' ? 'list' : 'grid';
  });
  const [groupBy, setGroupBy] = useState<GroupOption>('none');
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const hasFetchedRef = useRef(false);

  // Share
  const [shareTarget, setShareTarget] = useState<Book | null>(null);
  const [shareUsername, setShareUsername] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [shareMsg, setShareMsg] = useState("");
  const [sharedBooks, setSharedBooks] = useState<{ share_id: number; book_id: number; title: string; owner_username: string; created_at: string }[]>([]);
  const [sharedBooksLoading, setSharedBooksLoading] = useState(true);

  const fetchSharedBooks = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/books/shared-with-me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSharedBooks(await res.json());
    } catch { /* ignore */ }
    setSharedBooksLoading(false);
  }, []);

  useEffect(() => { fetchSharedBooks(); }, [fetchSharedBooks]);

  const handleShare = useCallback(async () => {
    if (!shareTarget || !shareUsername.trim()) return;
    setShareStatus("loading");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/books/${shareTarget.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: shareUsername.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareStatus("ok");
        setShareMsg(`Shared with ${shareUsername.trim()}`);
        setTimeout(() => { setShareTarget(null); setShareUsername(""); setShareStatus("idle"); }, 2000);
      } else {
        setShareStatus("error");
        setShareMsg(data.detail || "Failed");
      }
    } catch {
      setShareStatus("error");
      setShareMsg("Network error");
    }
  }, [shareTarget, shareUsername]);
  
  useEffect(() => {
    localStorage.setItem('library-view-mode', viewMode);
  }, [viewMode]);
  

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

  // Semantic search via API
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const doSearch = async () => {
      setSearchLoading(true);
      try {
        const token = localStorage.getItem("token");
        const params = new URLSearchParams();
        params.set("q", searchQuery.trim());
        params.set("top_k", "20");
        const res = await fetch(`/api/books/search?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data: SearchResultItem[] = await res.json();
          setSearchResults(data);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    doSearch();
  }, [searchQuery]);

  // Filter and sort books (only when not in semantic search mode)
  const filteredBooks = useMemo(() => {
    let result = books;

    // Only client-side filter when not using search API
    if (!searchQuery.trim()) {
      // No additional filtering needed
    }

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
  }, [books, sortBy, sortOrder]);

  const groupedBooks = useMemo(() => {
    if (groupBy === 'none') return null;

    const getStatus = (book: Book): BookStatus => {
      if (book.progress_percentage === 100) return 'finished';
      if (book.current_page && book.current_page > 0) return 'reading';
      return 'unread';
    };

    const groups: Record<BookStatus, Book[]> = { reading: [], unread: [], finished: [] };
    filteredBooks.forEach((book) => {
      groups[getStatus(book)].push(book);
    });

    return groups;
  }, [filteredBooks, groupBy]);

  const isSearchMode = !!searchQuery.trim();

  const [deletedBook, setDeletedBook] = useState<Book | null>(null);
  const [, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<Book | null>(null);

  const confirmDeleteBook = useCallback(async (book: Book) => {
    setDeletingId(book.id);
    setDeletedBook(book);
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setBooks((prev) => [...prev, book]);
        setDeletedBook(null);
      }
    } catch {
      setBooks((prev) => [...prev, book]);
      setDeletedBook(null);
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleDeleteBook = useCallback(async (bookId: number, skipConfirm = false) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    if (!skipConfirm) {
      setDeleteConfirmTarget(book);
      return;
    }
    confirmDeleteBook(book);
  }, [books, confirmDeleteBook]);

  const confirmDelete = useCallback(() => {
    if (deleteConfirmTarget) confirmDeleteBook(deleteConfirmTarget);
    setDeleteConfirmTarget(null);
  }, [deleteConfirmTarget, confirmDeleteBook]);

  const handleUndoDelete = useCallback(() => {
    if (deletedBook) {
      setBooks((prev) => [...prev, deletedBook]);
      setDeletedBook(null);
    }
  }, [deletedBook]);

  useEffect(() => {
    if (!deletedBook) return;
    const timer = setTimeout(() => setDeletedBook(null), 5000);
    return () => clearTimeout(timer);
  }, [deletedBook]);

  if (loading) return <div className="flex-1 px-8 py-6"><SkeletonGrid count={6} /></div>;

  const BookListRow = ({ book }: { book: Book }) => {
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
            {indexed && (
              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">Indexed</span>
            )}
            {kpCount > 0 && (
              <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{kpCount} KP</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author || "unknown"}</p>
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
            onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }}
            className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-400 hover:border-red-300 hover:text-red-500 dark:border-gray-600 dark:text-gray-500 dark:hover:border-red-400 dark:hover:text-red-400"
          >
            <DeleteOutlineOutlined sx={{ fontSize: 12 }} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShareTarget(book); setShareStatus("idle"); setShareUsername(""); setShareMsg(""); }}
            className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-400 hover:border-blue-300 hover:text-blue-500 dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-400 dark:hover:text-blue-400"
            title="Share"
          >
            <ShareOutlined sx={{ fontSize: 12 }} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full px-8 py-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{t('library.pageTitle')}</h1>
        {books.length > 0 && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            aria-label="upload-book"
          >
            {t('library.uploadButton')}
          </button>
        )}
      </div>

      {deletedBook && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 dark:bg-amber-900/20 dark:border-amber-800 animate-fade-in">
          <span className="text-sm text-amber-800 dark:text-amber-200">
            "{deletedBook.title}" deleted.
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition"
          >
            Undo
          </button>
        </div>
      )}

      {/* Toolbar */}
      {books.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {isSearchMode && !searchLoading && searchResults && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            </div>
          )}
          <div className="flex-1" />
          {/* Group by — hidden during search */}
          {!isSearchMode && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              <option value="none">{t('library.groupBy.none')}</option>
              <option value="status">{t('library.groupBy.status')}</option>
            </select>
          )}
          {/* Sort — hidden during search */}
          {!isSearchMode && (
            <div className="flex items-center gap-2">
              <SortOutlined className="text-gray-400" fontSize="small" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
              >
                <option value="title">{t('library.sortBy.title')}</option>
                <option value="author">{t('library.sortBy.author')}</option>
                <option value="current_page">{t('library.sortBy.progress')}</option>
                <option value="date_added">{t('library.sortBy.dateAdded')}</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
                aria-label="toggle-sort-order"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-gray-300 bg-white overflow-hidden dark:border-gray-600 dark:bg-gray-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              aria-label="grid-view"
              title="Grid"
            >
              <GridViewOutlined fontSize="small" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition ${viewMode === 'list' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              aria-label="list-view"
              title="List"
            >
              <ViewListOutlined fontSize="small" />
            </button>
          </div>
        </div>
      )}

      {showUpload && (
        <FileUpload
          onUploadComplete={() => {
            setShowUpload(false);
            fetchBooks();
          }}
          onClose={() => setShowUpload(false)}
        />
      )}

      {isSearchMode ? (
        searchLoading ? (
          <div className="py-6"><SkeletonCard /></div>
        ) : searchResults && searchResults.length > 0 ? (
          <div className="flex flex-col gap-3">
            {searchResults.map((r) => (
              <div
                key={r.book_id}
                onClick={() => navigate(`/reader/${r.book_id}`)}
                className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:shadow-md transition dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="h-14 w-10 shrink-0 rounded bg-gray-100 flex items-center justify-center dark:bg-gray-800">
                  <span className="text-lg">📚</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{r.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{r.snippet}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>Score: {(r.score * 100).toFixed(0)}%</span>
                    {r.chunk_page != null && <span>· p.{r.chunk_page}</span>}
                  </div>
                </div>
                <ArrowForwardOutlined className="shrink-0 mt-3 text-gray-300" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-center items-center py-20">
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 dark:bg-gray-800">
                <SearchOffOutlined sx={{ fontSize: 40 }} className="text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-1 dark:text-gray-200">No results found</h3>
              <p className="text-sm text-gray-400 mb-6 dark:text-gray-500">
                We couldn't find anything for "{searchQuery}"
              </p>
              <button
                onClick={() => navigate('/library')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Clear search
              </button>
            </div>
          </div>
        )
      ) : filteredBooks.length > 0 ? (
        <>
          {groupedBooks ? (
            <div className="flex flex-col gap-8">
              {(['reading', 'unread', 'finished'] as BookStatus[]).map((status) =>
                groupedBooks[status].length === 0 ? null : (
                  <section key={status}>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {t(`library.groups.${status}`)} · {groupedBooks[status].length}
                    </h2>
                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {groupedBooks[status].map((book) => <BookCard key={book.id} book={book} onDelete={handleDeleteBook} />)}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {groupedBooks[status].map((book) => <BookListRow key={book.id} book={book} />)}
                      </div>
                    )}
                  </section>
                )
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {filteredBooks.map((book) => <BookCard key={book.id} book={book} onDelete={handleDeleteBook} />)}
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
        <div className="flex justify-center items-center py-20">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 dark:bg-gray-800">
              <LibraryBooksOutlined sx={{ fontSize: 40 }} className="text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-1 dark:text-gray-200">No books found</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Try adjusting your filters or upload a new book
            </p>
          </div>
        </div>
      )}

      {/* Shared with me */}
      {!sharedBooksLoading && sharedBooks.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Shared with me</h2>
          <div className="flex flex-col gap-2">
            {sharedBooks.map((sb) => (
              <div key={sb.share_id} className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-800 dark:bg-blue-900/20">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-200 flex-1">{sb.title}</span>
                <span className="text-xs text-blue-600 dark:text-blue-400">by {sb.owner_username}</span>
                <button
                  onClick={() => navigate(`/reader/${sb.book_id}`)}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Read
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirmTarget(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Book</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete "{deleteConfirmTarget.title}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmTarget(null)} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={confirmDelete} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share dialog */}
      {shareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShareTarget(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Share "{shareTarget.title}"</h3>
            <input
              type="text"
              placeholder="Enter username"
              value={shareUsername}
              onChange={(e) => setShareUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleShare(); }}
              disabled={shareStatus === "loading"}
              className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            />
            {shareMsg && (
              <p className={`mb-3 text-xs ${shareStatus === "error" ? "text-red-600" : "text-green-600"}`}>{shareMsg}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShareTarget(null)} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={handleShare} disabled={shareStatus === "loading" || !shareUsername.trim()} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {shareStatus === "loading" ? "Sharing..." : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Library;
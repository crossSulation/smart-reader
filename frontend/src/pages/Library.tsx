import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { SortOutlined, GridViewOutlined, ViewListOutlined, SearchOffOutlined, LibraryBooksOutlined, ArrowForwardOutlined } from '@mui/icons-material';
import BookCard from "../components/BookCard";
import BookListRow from "../components/BookListRow";
import { localSearch, ensureChunkCache } from "../services/localSearch";
import { useBooks, useSharedBooks, useBookShares, useShareActions } from "../api";
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
  const searchQuery = searchParams.get('q') || '';
  const [sortBy, setSortBy] = useState<SortOption>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showUpload, setShowUpload] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('library-view-mode');
    return saved === 'list' ? 'list' : 'grid';
  });
  const [groupBy, setGroupBy] = useState<GroupOption>('none');
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Share
  const [shareTarget, setShareTarget] = useState<Book | null>(null);
  const [shareUsername, setShareUsername] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<{ id: number; username: string }[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [shareMsg, setShareMsg] = useState("");
  const [currentBookId, setCurrentBookId] = useState<number | null>(null);

  const { data: sharedBooks = [] } = useSharedBooks();
  const { data: currentShares = [] } = useBookShares(currentBookId);
  const { shareBook, unshareBook, searchUsers: searchUsersApi } = useShareActions();

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) { setUserSearchResults([]); setShowUserDropdown(false); return; }
    setUserSearchLoading(true);
    try {
      const data = await searchUsersApi(query);
      setUserSearchResults(data);
      setShowUserDropdown(data.length > 0);
    } catch { /* ignore */ }
    setUserSearchLoading(false);
  }, [searchUsersApi]);

  const handleShare = useCallback(async () => {
    if (!shareTarget || !shareUsername.trim()) return;
    setShareStatus("loading");
    try {
      await shareBook(shareTarget.id, shareUsername.trim());
      setShareStatus("ok");
      setShareMsg(`Shared with ${shareUsername.trim()}`);
      setTimeout(() => { setShareTarget(null); setShareUsername(""); setShareStatus("idle"); }, 2000);
    } catch (err: any) {
      setShareStatus("error");
      setShareMsg(err.message || "Failed");
    }
  }, [shareTarget, shareUsername, shareBook]);
  
  useEffect(() => {
    localStorage.setItem('library-view-mode', viewMode);
  }, [viewMode]);
  

  const { data: books = [], isLoading: loading, mutate: setBooks } = useBooks();

  // Preload chunk cache for local search
  useEffect(() => {
    ensureChunkCache();
  }, []);

  // Semantic search (local first, fallback to server)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const doSearch = async () => {
      setSearchLoading(true);
      try {
        // Try local search
        const localResults = await localSearch(
          searchQuery.trim(),
          books.map((b) => ({ id: b.id, title: b.title, author: b.author ?? null, file_type: b.file_type ?? null })),
          20,
        );
        if (localResults.length > 0) {
          setSearchResults(localResults);
          setSearchLoading(false);
          return;
        }
      } catch { /* fall through to server */ }

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
  }, [searchQuery, books]);

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
    setBooks((prev) => prev!.filter((b) => b.id !== book.id), { revalidate: false });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setBooks((prev) => [...prev!, book], { revalidate: false });
        setDeletedBook(null);
      }
    } catch {
      setBooks((prev) => [...prev!, book], { revalidate: false });
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
      setBooks((prev) => [...prev!, deletedBook], { revalidate: false });
      setDeletedBook(null);
    }
  }, [deletedBook]);

  useEffect(() => {
    if (!deletedBook) return;
    const timer = setTimeout(() => setDeletedBook(null), 5000);
    return () => clearTimeout(timer);
  }, [deletedBook]);

  if (loading) return <div className="flex-1 px-4 py-4 md:px-8 md:py-6"><SkeletonGrid count={6} /></div>;

  return (
    <div className="flex flex-col flex-1 h-full px-4 py-4 md:px-8 md:py-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{t('library.pageTitle')}</h1>
        {books.length > 0 && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm"
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
            setBooks();
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
                        {groupedBooks[status].map((book) => <BookCard key={book.id} book={book} onDelete={handleDeleteBook} onShare={(b) => { setShareTarget(b); setShareStatus("idle"); setShareUsername(""); setShareMsg(""); setCurrentBookId(b.id); }} />)}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {groupedBooks[status].map((book) => <BookListRow key={book.id} book={book} onDelete={handleDeleteBook} onShare={(b) => { setShareTarget(b); setShareStatus("idle"); setShareUsername(""); setShareMsg(""); setCurrentBookId(b.id); }} />)}
                      </div>
      )}

      {/* Shared with me */}
      {sharedBooks.length > 0 && (
        <div className="mb-6">
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
                  </section>
                )
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {filteredBooks.map((book) => <BookCard key={book.id} book={book} onDelete={handleDeleteBook} onShare={(b) => { setShareTarget(b); setShareStatus("idle"); setShareUsername(""); setShareMsg(""); setCurrentBookId(b.id); }} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredBooks.map((book) => <BookListRow key={book.id} book={book} onDelete={handleDeleteBook} onShare={(b) => { setShareTarget(b); setShareStatus("idle"); setShareUsername(""); setShareMsg(""); setCurrentBookId(b.id); }} />)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShareTarget(null); setShowUserDropdown(false); }}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Share "{shareTarget.title}"</h3>

            {currentShares.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-2 dark:text-gray-400">Shared with</p>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {currentShares.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 dark:bg-gray-800">
                      <span className="text-sm text-gray-700 dark:text-gray-300">@{s.username}</span>
                      <button
                        onClick={() => unshareBook(shareTarget.id, s.id)}
                        className="text-[11px] text-red-500 hover:text-red-700"
                      >
                        Unshare
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search users..."
                value={shareUsername || userSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  if (shareUsername) { setShareUsername(""); setUserSearch(v); }
                  else { setUserSearch(v); }
                  searchUsers(v);
                }}
                onFocus={() => { if (userSearchResults.length > 0) setShowUserDropdown(true); }}
                disabled={shareStatus === "loading"}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              {showUserDropdown && userSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                  {userSearchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setShareUsername(u.username); setUserSearch(""); setShowUserDropdown(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 dark:text-gray-300 dark:hover:bg-blue-900/20"
                    >
                      {u.username}
                    </button>
                  ))}
                </div>
              )}
              {userSearchLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</span>
              )}
            </div>
            {shareMsg && (
              <p className={`mb-3 text-xs ${shareStatus === "error" ? "text-red-600" : "text-green-600"}`}>{shareMsg}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShareTarget(null); setShowUserDropdown(false); }} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
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
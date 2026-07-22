import { useEffect, useRef, useState, useCallback, useMemo, type TouchEvent } from "react";
import Skeleton from "./Skeleton";

type AnnotationType = 'highlight' | 'underline';

interface AnnotationRect { x: number; y: number; width: number; height: number; }

interface Annotation {
  id: string;
  page: number;
  type: AnnotationType;
  color: string;
  rects: AnnotationRect[];
}

interface TextLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PageData {
  page: number;
  total_pages: number;
  image: string;
  width: number;
  height: number;
  text_lines: TextLine[];
}

const HIGHLIGHT_COLORS = [
  'rgba(255,235,0,0.5)',
  'rgba(74,222,128,0.45)',
  'rgba(249,168,212,0.55)',
  'rgba(147,197,253,0.55)',
];

const UNDERLINE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706'];

type NativePDFViewerProps = {
  bookId?: string;
  fileUrlOverride?: string;
  initPage?: number;
  jumpToPage?: number;
  onTextSelected?: (text: string) => void;
  onPageChange?: (page: number) => void;
  onTotalPagesChange?: (totalPages: number) => void;
};

export default function NativePDFViewer({
  bookId,
  initPage = 1,
  jumpToPage,
  onTextSelected,
  onPageChange,
  onTotalPagesChange,
}: NativePDFViewerProps) {
  const [pageNumber, setPageNumber] = useState(initPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(600);

  const [activeTool, setActiveTool] = useState<'none' | AnnotationType>('none');
  const [activeColor, setActiveColor] = useState(HIGHLIGHT_COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const viewerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const pageNumberRef = useRef(pageNumber);
  const totalPagesRef = useRef(totalPages);
  const lastSavedPageRef = useRef<number | null>(null);
  const annotationStorageKey = bookId ? `annotations_native_${bookId}` : "annotations_native_local";

  useEffect(() => { pageNumberRef.current = pageNumber; }, [pageNumber]);
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

  const activeToolRef = useRef(activeTool);
  const activeColorRef = useRef(activeColor);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);

  useEffect(() => {
    const saved = localStorage.getItem(annotationStorageKey);
    if (saved) { try { setAnnotations(JSON.parse(saved)); } catch { /* ignore */ } }
  }, [annotationStorageKey]);

  useEffect(() => {
    localStorage.setItem(annotationStorageKey, JSON.stringify(annotations));
  }, [annotations, annotationStorageKey]);

  const saveProgress = async (page: number) => {
    if (!bookId) return;
    try {
      await fetch(`/api/books/${bookId}/progress`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ current_page: page, total_pages: totalPages || undefined }),
      });
      lastSavedPageRef.current = page;
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  };

  const fetchPage = useCallback(async (page: number) => {
    if (!bookId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/books/${bookId}/pages/${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError("Page not found");
        } else {
          setError("Failed to load page");
        }
        return;
      }
      const data: PageData = await res.json();
      setPageData(data);
      setTotalPages(data.total_pages);
      onTotalPagesChange?.(data.total_pages);
      setPageNumber(data.page);
      onPageChange?.(data.page);
    } catch {
      setError("Network error loading page");
    } finally {
      setLoading(false);
    }
  }, [bookId, onTotalPagesChange, onPageChange]);

  useEffect(() => {
    fetchPage(pageNumber);
  }, [pageNumber, fetchPage]);

  useEffect(() => {
    if (totalPages > 0 && bookId) {
      saveProgress(pageNumber);
    }
  }, [pageNumber, totalPages, bookId]);

  useEffect(() => {
    return () => {
      if (bookId && pageNumberRef.current !== lastSavedPageRef.current) {
        saveProgress(pageNumberRef.current);
      }
    };
  }, [bookId]);

  useEffect(() => {
    if (jumpToPage && jumpToPage >= 1 && jumpToPage <= totalPages) {
      setPageNumber(jumpToPage);
    }
  }, [jumpToPage, totalPages]);

  const handlePrev = useCallback(() => {
    if (pageNumberRef.current > 1) setPageNumber(pageNumberRef.current - 1);
  }, []);

  const handleNext = useCallback(() => {
    if (pageNumberRef.current < totalPagesRef.current) setPageNumber(pageNumberRef.current + 1);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartX.current) return;
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = 0;
    touchStartY.current = 0;
  }, [handleNext, handlePrev]);

  const handleMouseUpSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (text) onTextSelected?.(text);

    if (activeToolRef.current !== 'none' && text && selection && selection.rangeCount > 0 && textLayerRef.current) {
      const range = selection.getRangeAt(0);
      const layerRect = textLayerRef.current.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
      const rects: AnnotationRect[] = clientRects.map(rect => ({
        x: (rect.left - layerRect.left) / layerRect.width,
        y: (rect.top - layerRect.top) / layerRect.height,
        width: rect.width / layerRect.width,
        height: rect.height / layerRect.height,
      }));
      if (rects.length > 0) {
        setAnnotations(prev => [...prev, {
          id: crypto.randomUUID(),
          page: pageNumberRef.current,
          type: activeToolRef.current as AnnotationType,
          color: activeColorRef.current,
          rects,
        }]);
        selection.removeAllRanges();
      }
    }
  }, [onTextSelected]);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUpSelection);
    return () => document.removeEventListener('mouseup', handleMouseUpSelection);
  }, [handleMouseUpSelection]);

  useEffect(() => {
    const updateWidth = () => {
      if (!viewerRef.current) return;
      setPageWidth(Math.max(320, Math.floor(viewerRef.current.clientWidth - 2)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (viewerRef.current) observer.observe(viewerRef.current);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const undoAnnotation = () => setAnnotations(prev => prev.slice(0, -1));
  const clearAnnotations = () => {
    setAnnotations(prev => prev.filter(a => a.page !== pageNumber));
  };

  const pageAnnotations = useMemo(
    () => annotations.filter(a => a.page === pageNumber),
    [annotations, pageNumber]
  );

  const containerRatio = pageData ? pageData.width / pageData.height : 1;

  return (
    <div className="flex w-full min-h-full flex-col items-stretch px-4 md:px-6 pt-4 pb-4">
      {/* Annotation toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => setActiveTool('none')}
          className={`rounded px-2 py-0.5 text-xs font-medium transition ${activeTool === 'none' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          Select
        </button>
        <button
          onClick={() => { setActiveTool('highlight'); setActiveColor(HIGHLIGHT_COLORS[0]); }}
          className={`rounded px-2 py-0.5 text-xs font-medium transition ${activeTool === 'highlight' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          Highlight
        </button>
        <button
          onClick={() => { setActiveTool('underline'); setActiveColor(UNDERLINE_COLORS[0]); }}
          className={`rounded px-2 py-0.5 text-xs font-medium transition ${activeTool === 'underline' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          Underline
        </button>

        {activeTool === 'highlight' && (
          <div className="flex gap-1 ml-1">
            {HIGHLIGHT_COLORS.map((c, i) => (
              <button key={i} onClick={() => setActiveColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition ${activeColor === c ? 'border-blue-600 scale-110' : 'border-gray-300'}`}
                style={{ backgroundColor: c.replace('0.5', '0.7').replace('0.55', '0.8').replace('0.45', '0.7') }}
              />
            ))}
          </div>
        )}

        {activeTool === 'underline' && (
          <div className="flex gap-1 ml-1">
            {UNDERLINE_COLORS.map((c, i) => (
              <button key={i} onClick={() => setActiveColor(c)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${activeColor === c ? 'border-blue-600 scale-110' : 'border-gray-300'}`}
              >
                <span className="w-3 border-b-2" style={{ borderColor: c }} />
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {pageNumber} / {totalPages || '?'}
        </span>

        <button
          onClick={undoAnnotation}
          disabled={pageAnnotations.length === 0}
          className="rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300"
        >
          Undo
        </button>
        <button
          onClick={clearAnnotations}
          disabled={pageAnnotations.length === 0}
          className="rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300"
        >
          Clear page
        </button>
      </div>

      {/* Page content */}
      <div
        ref={viewerRef}
        className="relative flex flex-1 items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-full max-w-2xl h-96 rounded" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <p className="text-sm">{error}</p>
            <button
              onClick={() => fetchPage(pageNumber)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        )}

        {pageData && !loading && (
          <div className="relative" style={{ width: pageWidth, aspectRatio: containerRatio }}>
            <img
              src={pageData.image}
              alt={`Page ${pageData.page}`}
              className="w-full h-full object-contain select-none"
              draggable={false}
            />

            {/* Annotation overlays */}
            <div className="absolute inset-0 pointer-events-none">
              {pageAnnotations.map((a) => (
                a.type === 'highlight' ? (
                  a.rects.map((r, i) => (
                    <div
                      key={`${a.id}-${i}`}
                      className="absolute"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.width * 100}%`,
                        height: `${r.height * 100}%`,
                        backgroundColor: a.color,
                      }}
                    />
                  ))
                ) : (
                  a.rects.map((r, i) => (
                    <div
                      key={`${a.id}-${i}`}
                      className="absolute"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${(r.y + r.height) * 100}%`,
                        width: `${r.width * 100}%`,
                        borderBottom: `2px solid ${a.color}`,
                      }}
                    />
                  ))
                )
              ))}
            </div>

            {/* Text overlay for selection (transparent, positioned text) */}
            <div
              ref={textLayerRef}
              className="absolute inset-0 select-text"
              style={{ zIndex: 2 }}
              data-reader-content
            >
              {pageData.text_lines.map((line, idx) => (
                <span
                  key={idx}
                  className="absolute text-transparent select-text whitespace-pre"
                  style={{
                    left: `${line.x * 100}%`,
                    top: `${line.y * 100}%`,
                    width: `${line.w * 100}%`,
                    height: `${line.h * 100}%`,
                    fontSize: `${line.h * 100 * 0.7}vw`,
                    lineHeight: 1.2,
                    overflow: 'hidden',
                  }}
                >
                  {line.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons (hover) */}
      <div className="mt-2 flex justify-center">
        <button onClick={handlePrev} disabled={pageNumber <= 1}
          className="rounded px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-30 dark:bg-gray-800 dark:hover:bg-gray-700">
          Prev
        </button>
        <span className="mx-3 text-sm text-gray-500 dark:text-gray-400 self-center">
          {pageNumber} / {totalPages || '?'}
        </span>
        <button onClick={handleNext} disabled={pageNumber >= totalPages}
          className="rounded px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-30 dark:bg-gray-800 dark:hover:bg-gray-700">
          Next
        </button>
      </div>
    </div>
  );
}

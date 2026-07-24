import { useEffect, useRef, useState, useCallback, useMemo, type TouchEvent, type PointerEvent } from "react";
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

interface PageData {
  page: number;
  total_pages: number;
  image: string;
  width: number;
  height: number;
  text_lines: { text: string; x: number; y: number; w: number; h: number }[];
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
  const [readingTheme, setReadingTheme] = useState<'default' | 'wechat' | 'kindle'>(() => {
    return (localStorage.getItem('pdf-reading-theme') as any) || 'default';
  });

  const viewerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<AnnotationRect | null>(null);
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
        setError(res.status === 404 ? "Page not found" : "Failed to load page");
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
    if (totalPages > 0 && bookId) saveProgress(pageNumber);
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
    if (dragStartRef.current) return; // ignore pagination during annotation drag
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 60) {
      if (deltaX > 0) handleNext();
      else handlePrev();
    } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      if (viewerRef.current) {
        const rect = viewerRef.current.getBoundingClientRect();
        const xRatio = (touchStartX.current - rect.left) / rect.width;
        if (xRatio < 0.15) handlePrev();
        else if (xRatio > 0.85) handleNext();
      }
    }
    touchStartX.current = 0;
    touchStartY.current = 0;
  }, [handleNext, handlePrev]);

  // --- Rectangle drag annotation ---
  const getRelativeCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!pageContainerRef.current) return null;
    const r = pageContainerRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top) / r.height,
    };
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (activeToolRef.current === 'none') return;
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    const coords = getRelativeCoords(clientX, clientY);
    if (!coords) return;
    dragStartRef.current = coords;
    if ('setPointerCapture' in (e as PointerEvent).target) {
      ((e as PointerEvent).target as HTMLElement).setPointerCapture((e as PointerEvent).pointerId);
    }
  }, [getRelativeCoords]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    const coords = getRelativeCoords(clientX, clientY);
    if (!coords) return;
    const sx = dragStartRef.current.x;
    const sy = dragStartRef.current.y;
    setPreviewRect({
      x: Math.min(sx, coords.x),
      y: Math.min(sy, coords.y),
      width: Math.abs(coords.x - sx),
      height: Math.abs(coords.y - sy),
    });
  }, [getRelativeCoords]);

  const handleDragEnd = useCallback(() => {
    if (!dragStartRef.current || !previewRect) {
      dragStartRef.current = null;
      setPreviewRect(null);
      return;
    }
    const rect = previewRect;
    if (rect.width > 0.01 && rect.height > 0.01) {
      const newAnnotation: Annotation = {
        id: crypto.randomUUID(),
        page: pageNumberRef.current,
        type: activeToolRef.current as AnnotationType,
        color: activeColorRef.current,
        rects: [rect],
      };
      setAnnotations(prev => [...prev, newAnnotation]);

      if (onTextSelected && pageData) {
        const hitTexts: string[] = [];
        for (const line of pageData.text_lines) {
          const lx = line.x, ly = line.y, lw = line.w, lh = line.h;
          const ox = Math.max(rect.x, lx);
          const oy = Math.max(rect.y, ly);
          const ox2 = Math.min(rect.x + rect.width, lx + lw);
          const oy2 = Math.min(rect.y + rect.height, ly + lh);
          if (ox < ox2 && oy < oy2) hitTexts.push(line.text);
        }
        if (hitTexts.length > 0) onTextSelected(hitTexts.join(" "));
      }
    }
    dragStartRef.current = null;
    setPreviewRect(null);
  }, [previewRect, onTextSelected, pageData]);

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
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">Draw:</span>
        <button
          onClick={() => setActiveTool('highlight')}
          className={`rounded px-3 py-1 text-xs font-medium transition ${activeTool === 'highlight' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          Highlight
        </button>
        <button
          onClick={() => setActiveTool('underline')}
          className={`rounded px-3 py-1 text-xs font-medium transition ${activeTool === 'underline' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          Underline
        </button>

        {activeTool === 'highlight' && (
          <div className="flex gap-1 ml-1">
            {HIGHLIGHT_COLORS.map((c, i) => (
              <button key={i} onClick={() => setActiveColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition ${activeColor === c ? 'border-blue-600 scale-110' : 'border-gray-300'}`}
                style={{ backgroundColor: c.replace('0.5', '0.7').replace('0.55', '0.8').replace('0.45', '0.7') }}
              />
            ))}
          </div>
        )}

        {activeTool === 'underline' && (
          <div className="flex gap-1 ml-1">
            {UNDERLINE_COLORS.map((c, i) => (
              <button key={i} onClick={() => setActiveColor(c)}
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition"
                style={{ borderColor: activeColor === c ? '#2563eb' : '#d1d5db' }}
              >
                <span className="w-3 border-b-2" style={{ borderColor: c }} />
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {pageNumber} / {totalPages || '?'}
        </span>
        <select
          value={readingTheme}
          onChange={(e) => {
            const v = e.target.value as any;
            setReadingTheme(v);
            localStorage.setItem('pdf-reading-theme', v);
          }}
          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
        >
          <option value="default">默认</option>
          <option value="wechat">护眼</option>
          <option value="kindle">墨水屏</option>
        </select>
        <button onClick={undoAnnotation} disabled={pageAnnotations.length === 0}
          className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300">
          Undo
        </button>
        <button onClick={clearAnnotations} disabled={pageAnnotations.length === 0}
          className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300">
          Clear
        </button>
      </div>

      {/* Page content */}
      <div
        ref={viewerRef}
        className="relative flex flex-1 items-center justify-center"
        data-reading-theme={readingTheme}
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
            <button onClick={() => fetchPage(pageNumber)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">Retry</button>
          </div>
        )}

        {pageData && !loading && (
          <div
            ref={pageContainerRef}
            className="relative select-none"
            style={{ width: pageWidth, aspectRatio: containerRatio, touchAction: activeTool !== 'none' ? 'none' : 'auto' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handleDragEnd}
            onTouchStartCapture={(e) => {
              if (activeToolRef.current !== 'none') {
                handlePointerDown(e as any);
              }
            }}
            onTouchMoveCapture={(e) => {
              if (dragStartRef.current) {
                e.preventDefault();
                handlePointerMove(e as any);
              }
            }}
            onTouchEndCapture={() => handleDragEnd()}
          >
            <img
              src={pageData.image}
              alt={`Page ${pageData.page}`}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
              style={{ zIndex: 0 }}
            />

            {/* Saved annotations */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
              {pageAnnotations.map((a) => (
                a.type === 'highlight' ? (
                  a.rects.map((r, i) => (
                    <div key={`${a.id}-${i}`} className="absolute"
                      style={{
                        left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                        width: `${r.width * 100}%`, height: `${r.height * 100}%`,
                        backgroundColor: a.color,
                      }}
                    />
                  ))
                ) : (
                  a.rects.map((r, i) => (
                    <div key={`${a.id}-${i}`} className="absolute"
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

              {/* Live drag preview */}
              {previewRect && (
                activeToolRef.current === 'highlight' ? (
                  <div className="absolute" style={{
                    left: `${previewRect.x * 100}%`, top: `${previewRect.y * 100}%`,
                    width: `${previewRect.width * 100}%`, height: `${previewRect.height * 100}%`,
                    backgroundColor: activeColorRef.current,
                    opacity: 0.7,
                  }} />
                ) : activeToolRef.current === 'underline' ? (
                  <div className="absolute" style={{
                    left: `${previewRect.x * 100}%`,
                    top: `${(previewRect.y + previewRect.height) * 100}%`,
                    width: `${previewRect.width * 100}%`,
                    borderBottom: `2px solid ${activeColorRef.current}`,
                    opacity: 0.7,
                  }} />
                ) : null
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

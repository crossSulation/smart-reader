import { useEffect, useRef, useState, useCallback, useMemo, type TouchEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type AnnotationType = 'highlight' | 'underline';

interface AnnotationRect { x: number; y: number; width: number; height: number; }

interface Annotation {
  id: string;
  page: number;
  type: AnnotationType;
  color: string;
  rects: AnnotationRect[];
}

const HIGHLIGHT_COLORS = [
  'rgba(255,235,0,0.5)',
  'rgba(74,222,128,0.45)',
  'rgba(249,168,212,0.55)',
  'rgba(147,197,253,0.55)',
];

const UNDERLINE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706'];

type PDFViewerProps = {
  bookId?: string;
  fileUrlOverride?: string;
  initPage?: number;
  jumpToPage?: number;
  onTextSelected?: (text: string) => void;
  onPageChange?: (page: number) => void;
  onTotalPagesChange?: (totalPages: number) => void;
};

export default function PDFViewer({
  bookId,
  fileUrlOverride,
  initPage = 1,
  jumpToPage,
  onTextSelected,
  onPageChange,
  onTotalPagesChange,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [fileUrl, setFileUrl] = useState("");
  const [showLoader, setShowLoader] = useState(true);
  const loaderStartRef = useRef(Date.now());
  const [pageLoading, setPageLoading] = useState(false);
  const currentPageLoadingRef = useRef(false);

  const pdfOptions = useMemo(() => ({
    useWorkerFetch: true,
    isEvalSupported: false,
  }), []);
  const [pageWidth, setPageWidth] = useState(0);
  const currentPageRef = useRef<number>(1);
  const lastSavedPageRef = useRef<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<'none' | AnnotationType>('none');
  const [activeColor, setActiveColor] = useState(HIGHLIGHT_COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationStorageKey = bookId ? `annotations_${bookId}` : "annotations_local";

  const fileObject = useMemo(
    () => {
      if (!fileUrl) return null;
      if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
        return fileUrl;
      }
      return { url: fileUrl, httpHeaders: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
    },
    [fileUrl]
  );

  useEffect(() => {
    if (fileUrlOverride) {
      setFileUrl(fileUrlOverride);
      return;
    }
    if (!bookId) {
      return;
    }

    const fetchFile = async () => {
      const res = await fetch(`/api/books/${bookId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data.file_url) {
        setFileUrl(data.file_url);
      }
    };
    fetchFile();
  }, [bookId, fileUrlOverride]);

  const saveProgress = async (page: number) => {
    if (!bookId) return;

    try {
      await fetch(`/api/books/${bookId}/progress`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ current_page: page, total_pages: numPages || undefined }),
      });
      lastSavedPageRef.current = page;
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  };

  const pageNumberRef = useRef(pageNumber);
  const numPagesRef = useRef(numPages);

  useEffect(() => { pageNumberRef.current = pageNumber; }, [pageNumber]);
  useEffect(() => { numPagesRef.current = numPages; }, [numPages]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= numPagesRef.current && newPage !== pageNumberRef.current) {
      setPageLoading(true);
      currentPageLoadingRef.current = true;
      setPageNumber(newPage);
    }
  }, []);

  // Touch event handlers for swipe gestures
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartX.current) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchStartX.current - touchEndX;
    const deltaY = touchStartY.current - touchEndY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        handlePageChange(pageNumberRef.current + 1);
      } else {
        handlePageChange(pageNumberRef.current - 1);
      }
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
  }, [handlePageChange]);

  // Jump to a specific page when triggered from search results
  useEffect(() => {
    if (jumpToPage && jumpToPage >= 1 && numPages > 0 && jumpToPage <= numPages) {
      handlePageChange(jumpToPage);
    }
  }, [jumpToPage, numPages, handlePageChange]);

  useEffect(() => {
    currentPageRef.current = pageNumber;
    onPageChange?.(pageNumber);
    if (numPages > 0 && bookId) {
      saveProgress(pageNumber);
    }
  }, [pageNumber, numPages, onPageChange, bookId]);

  useEffect(() => {
    return () => {
      if (!bookId) return;

      const pageToSave = currentPageRef.current;
      if (pageToSave && pageToSave !== lastSavedPageRef.current) {
        saveProgress(pageToSave);
      }
    };
  }, [bookId]);

  useEffect(() => {
    const saved = localStorage.getItem(annotationStorageKey);
    if (saved) { try { setAnnotations(JSON.parse(saved)); } catch { /* ignore */ } }
  }, [annotationStorageKey]);

  useEffect(() => {
    localStorage.setItem(annotationStorageKey, JSON.stringify(annotations));
  }, [annotations, annotationStorageKey]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    onTotalPagesChange?.(numPages);
    const initial = Math.min(Math.max(initPage, 1), numPages);
    setPageNumber(initial);
    const elapsed = Date.now() - loaderStartRef.current;
    if (elapsed < 800) {
      setTimeout(() => setShowLoader(false), 800 - elapsed);
    } else {
      setShowLoader(false);
    }
  }

  const activeToolRef = useRef(activeTool);
  const activeColorRef = useRef(activeColor);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);

  const handleMouseUpSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (text) onTextSelected?.(text);

    if (activeToolRef.current !== 'none' && text && selection && selection.rangeCount > 0 && pageContainerRef.current) {
      const range = selection.getRangeAt(0);
      const pageRect = pageContainerRef.current.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
      const rects: AnnotationRect[] = clientRects.map(rect => ({
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        width: rect.width / pageRect.width,
        height: rect.height / pageRect.height,
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
      // Keep page within the available middle column width.
      setPageWidth(Math.max(320, Math.floor(viewerRef.current.clientWidth - 2)));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    if (viewerRef.current) {
      observer.observe(viewerRef.current);
    }

    window.addEventListener('resize', updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  return (
    <div className="flex w-full min-h-full flex-col items-stretch px-4 md:px-6 pt-4 pb-4">
        {/* Annotation toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setActiveTool('none')}
            className={`rounded px-2 py-1 transition-colors ${activeTool === 'none' ? 'bg-gray-800 text-white dark:bg-gray-300 dark:text-gray-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`}
            title="Normal select"
          >✦ Select</button>
          <button
            onClick={() => { setActiveTool('highlight'); setActiveColor(HIGHLIGHT_COLORS[0]); }}
            className={`rounded px-2 py-1 transition-colors ${activeTool === 'highlight' ? 'bg-yellow-300 text-gray-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`}
            title="Highlight"
          >▐ Highlight</button>
          <button
            onClick={() => { setActiveTool('underline'); setActiveColor(UNDERLINE_COLORS[0]); }}
            className={`rounded px-2 py-1 transition-colors ${activeTool === 'underline' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`}
            title="Underline"
          ><u>U</u> Underline</button>

          {activeTool !== 'none' && (
            <>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              {(activeTool === 'highlight' ? HIGHLIGHT_COLORS : UNDERLINE_COLORS).map(color => (
                <button
                  key={color}
                  onClick={() => setActiveColor(color)}
                  className={`h-5 w-5 rounded-full border-2 transition-transform ${activeColor === color ? 'scale-125 border-gray-700 dark:border-gray-300' : 'border-gray-300 dark:border-gray-500 hover:scale-110'}`}
                  style={{ background: color }}
                  title={color}
                />
              ))}
            </>
          )}

          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            disabled={annotations.length === 0}
            className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700 dark:text-gray-300"
            title="Undo last annotation"
          >↩ Undo</button>
          <button
            onClick={() => setAnnotations(prev => prev.filter(a => a.page !== pageNumber))}
            disabled={annotations.filter(a => a.page === pageNumber).length === 0}
            className="rounded px-2 py-1 text-red-500 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-900/30 dark:text-red-400"
            title="Clear all annotations on this page"
          >🗑 Clear page</button>
        </div>

        <div
          className="relative group w-full border shadow-lg rounded-lg overflow-hidden dark:border-gray-700"
          ref={viewerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            touchAction: 'pan-y',
            userSelect: 'text',
            cursor: activeTool !== 'none' ? 'text' : 'auto',
          }}
        >
          {pageNumber > 1 && (
            <button
              type="button"
              onClick={() => handlePageChange(pageNumber - 1)}
              className="absolute left-0 top-0 z-10 flex h-full w-16 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous page"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-md transition-shadow hover:shadow-lg dark:bg-gray-800/80">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-300"><polyline points="15 18 9 12 15 6"/></svg>
              </span>
            </button>
          )}
          {pageNumber < numPages && (
            <button
              type="button"
              onClick={() => handlePageChange(pageNumber + 1)}
              className="absolute right-0 top-0 z-10 flex h-full w-16 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next page"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-md transition-shadow hover:shadow-lg dark:bg-gray-800/80">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-300"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
            </button>
          )}
          {!fileObject ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center">
              <div className="book-loader flex items-center" style={{ width: 72, height: 96 }}>
                <div className="book-spine" />
                <div className="relative flex-1" style={{ height: "100%" }}>
                  <div className="page" />
                  <div className="page" />
                  <div className="page" />
                  <div className="page" />
                  <div className="page" />
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading document...</p>
            </div>
          ) : (
          <Document
            file={fileObject}
            onLoadSuccess={onDocumentLoadSuccess}
            options={pdfOptions}
            className="border shadow-lg"
          >
            {showLoader && (
              <div className="flex min-h-[320px] flex-col items-center justify-center">
                <div className="book-loader flex items-center" style={{ width: 72, height: 96 }}>
                  <div className="book-spine" />
                  <div className="relative flex-1" style={{ height: "100%" }}>
                    <div className="page" />
                    <div className="page" />
                    <div className="page" />
                    <div className="page" />
                    <div className="page" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading document...</p>
              </div>
            )}
            {!showLoader && (
            <div ref={pageContainerRef} className="relative dark:[&_canvas]:brightness-90 dark:[&_canvas]:invert dark:[&_canvas]:hue-rotate-180">
              {pageLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-800/70">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Loading page {pageNumber}...</span>
                  </div>
                </div>
              )}
              <Page
                pageNumber={pageNumber}
                width={pageWidth || Math.floor(window.innerWidth * 0.8)}
                renderTextLayer={!pageLoading}
                renderAnnotationLayer={false}
                onRenderSuccess={() => { setPageLoading(false); currentPageLoadingRef.current = false; }}
                className="pdf-page"
              />
              {/* Annotation overlay — percentages are relative to pageContainerRef */}
              <div className="pointer-events-none absolute inset-0" style={{ zIndex: 4 }}>
                {annotations
                  .filter(a => a.page === pageNumber)
                  .flatMap(a =>
                    a.rects.map((rect, i) =>
                      a.type === 'highlight' ? (
                        <div
                          key={`${a.id}-${i}`}
                          style={{
                            position: 'absolute',
                            left: `${rect.x * 100}%`,
                            top: `${rect.y * 100}%`,
                            width: `${rect.width * 100}%`,
                            height: `${rect.height * 100}%`,
                            background: a.color,
                            mixBlendMode: 'multiply',
                          }}
                        />
                      ) : (
                        <div
                          key={`${a.id}-${i}`}
                          style={{
                            position: 'absolute',
                            left: `${rect.x * 100}%`,
                            top: `${(rect.y + rect.height) * 100}%`,
                            width: `${rect.width * 100}%`,
                            height: '2px',
                            background: a.color,
                          }}
                        />
                      )
                    )
                  )}
              </div>
            </div>
            )}
          </Document>
          )}
        </div>
    </div>
  );
}

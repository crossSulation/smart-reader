import { useEffect, useRef, useState, useCallback, useMemo, type TouchEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { useTranslation } from 'react-i18next';

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
  bookId: string;
  initPage?: number;
  jumpToPage?: number;
  onTextSelected?: (text: string) => void;
};

export default function PDFViewer({
  bookId,
  initPage = 1,
  jumpToPage,
  onTextSelected,
}: PDFViewerProps) {
  const { t } = useTranslation();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [fileUrl, setFileUrl] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const currentPageRef = useRef<number>(1);
  const lastSavedPageRef = useRef<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<'none' | AnnotationType>('none');
  const [activeColor, setActiveColor] = useState(HIGHLIGHT_COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const fileObject = useMemo(
    () => fileUrl ? { url: fileUrl, httpHeaders: { Authorization: `Bearer ${localStorage.getItem("token")}` } } : null,
    [fileUrl]
  );

  useEffect(() => {
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
  }, [bookId]);

  const saveProgress = async (page: number) => {
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

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= numPages && !isAnimating) {
      setIsAnimating(true);
      setPageNumber(newPage);
      setTimeout(() => setIsAnimating(false), 300); // Animation duration
    }
  }, [numPages, isAnimating]);

  // Touch event handlers for swipe gestures
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartX.current || isAnimating) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchStartX.current - touchEndX;
    const deltaY = touchStartY.current - touchEndY;

    // Check if it's a horizontal swipe (more horizontal than vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // Swipe left - next page
        handlePageChange(pageNumber + 1);
      } else {
        // Swipe right - previous page
        handlePageChange(pageNumber - 1);
      }
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
  }, [pageNumber, handlePageChange, isAnimating]);

  // Jump to a specific page when triggered from search results
  useEffect(() => {
    if (jumpToPage && jumpToPage >= 1 && numPages > 0 && jumpToPage <= numPages) {
      handlePageChange(jumpToPage);
    }
  }, [jumpToPage, numPages, handlePageChange]);

  useEffect(() => {
    currentPageRef.current = pageNumber;
    if (numPages > 0) {
      saveProgress(pageNumber);
    }
  }, [pageNumber, numPages]);

  useEffect(() => {
    thumbnailRefs.current[pageNumber - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pageNumber]);

  useEffect(() => {
    return () => {
      const pageToSave = currentPageRef.current;
      if (pageToSave && pageToSave !== lastSavedPageRef.current) {
        saveProgress(pageToSave);
      }
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(`annotations_${bookId}`);
    if (saved) { try { setAnnotations(JSON.parse(saved)); } catch { /* ignore */ } }
  }, [bookId]);

  useEffect(() => {
    localStorage.setItem(`annotations_${bookId}`, JSON.stringify(annotations));
  }, [annotations, bookId]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    const initial = Math.min(Math.max(initPage, 1), numPages);
    setPageNumber(initial);
  }

  const activeToolRef = useRef(activeTool);
  const activeColorRef = useRef(activeColor);
  const pageNumberRef = useRef(pageNumber);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { pageNumberRef.current = pageNumber; }, [pageNumber]);

  const handleMouseUpSelection = useCallback(() => {
    const pageContainer = pageContainerRef.current;
    if (!pageContainer) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      return;
    }

    const range = selection.getRangeAt(0);
    // Ignore selections made outside the current PDF page container.
    if (!pageContainer.contains(range.commonAncestorContainer)) {
      return;
    }

    onTextSelected?.(text);

    if (activeToolRef.current === 'none') {
      return;
    }

    const pageRect = pageContainer.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1);
    if (clientRects.length === 0) {
      return;
    }

    const rects: AnnotationRect[] = clientRects.map((rect) => ({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    }));

    setAnnotations((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        page: pageNumberRef.current,
        type: activeToolRef.current as AnnotationType,
        color: activeColorRef.current,
        rects,
      },
    ]);
    selection.removeAllRanges();
  }, [onTextSelected]);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUpSelection);
    return () => document.removeEventListener('mouseup', handleMouseUpSelection);
  }, [handleMouseUpSelection]);

  return (
    <div className="flex h-full">
      {/* Left page thumbnail sidebar */}
      <div className="w-[108px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
        {numPages > 0 && fileObject && (
          <Document file={fileObject} loading="">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
              <div
                key={page}
                ref={(el) => { thumbnailRefs.current[page - 1] = el; }}
                onClick={() => handlePageChange(page)}
                className={`m-1 cursor-pointer rounded border-2 transition-colors ${pageNumber === page
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent hover:border-blue-300'
                  }`}
              >
                <Page
                  pageNumber={page}
                  width={88}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                <div className="py-0.5 text-center text-xs text-gray-500">{page}</div>
              </div>
            ))}
          </Document>
        )}
      </div>

      {/* Main viewer */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto pt-4">
        {/* Annotation toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm">
          <button
            onClick={() => setActiveTool('none')}
            className={`rounded px-2 py-1 transition-colors ${activeTool === 'none' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100'}`}
            title="Normal select"
          >✦ Select</button>
          <button
            onClick={() => { setActiveTool('highlight'); setActiveColor(HIGHLIGHT_COLORS[0]); }}
            className={`rounded px-2 py-1 transition-colors ${activeTool === 'highlight' ? 'bg-yellow-300 text-gray-900' : 'hover:bg-gray-100'}`}
            title="Highlight"
          >▐ Highlight</button>
          <button
            onClick={() => { setActiveTool('underline'); setActiveColor(UNDERLINE_COLORS[0]); }}
            className={`rounded px-2 py-1 transition-colors ${activeTool === 'underline' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
            title="Underline"
          ><u>U</u> Underline</button>

          {activeTool !== 'none' && (
            <>
              <span className="text-gray-300">|</span>
              {(activeTool === 'highlight' ? HIGHLIGHT_COLORS : UNDERLINE_COLORS).map(color => (
                <button
                  key={color}
                  onClick={() => setActiveColor(color)}
                  className={`h-5 w-5 rounded-full border-2 transition-transform ${activeColor === color ? 'scale-125 border-gray-700' : 'border-gray-300 hover:scale-110'}`}
                  style={{ background: color }}
                  title={color}
                />
              ))}
            </>
          )}

          <span className="text-gray-300">|</span>
          <button
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            disabled={annotations.length === 0}
            className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
            title="Undo last annotation"
          >↩ Undo</button>
          <button
            onClick={() => setAnnotations(prev => prev.filter(a => a.page !== pageNumber))}
            disabled={annotations.filter(a => a.page === pageNumber).length === 0}
            className="rounded px-2 py-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
            title="Clear all annotations on this page"
          >🗑 Clear page</button>
        </div>

        <div className="mb-4 flex gap-4">
          <button
            onClick={() => handlePageChange(pageNumber - 1)}
            disabled={pageNumber <= 1 || isAnimating}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 transition"
          >
            {t('pdfViewer.previous')}
          </button>
          <span className="px-4 py-2">
            {t('pdfViewer.page')} {pageNumber} {t('pdfViewer.of')} {numPages || "?"}
          </span>
          <button
            onClick={() => handlePageChange(pageNumber + 1)}
            disabled={pageNumber >= numPages || isAnimating}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 transition"
          >
            {t('pdfViewer.next')}
          </button>
        </div>

        <div className="mb-2 text-sm text-gray-500 text-center">
          {t('pdfViewer.swipeHint')}
        </div>

        <div
          ref={viewerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="border shadow-lg rounded-lg overflow-hidden"
          style={{
            touchAction: 'pan-y',
            userSelect: 'text',
            cursor: activeTool !== 'none' ? 'text' : 'auto',
          }}
        >
          <Document
            file={fileObject}
            onLoadSuccess={onDocumentLoadSuccess}
            className="border shadow-lg"
          >
            <div ref={pageContainerRef} className="relative">
              <Page
                pageNumber={pageNumber}
                width={window.innerWidth * 0.8}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                className={`pdf-page ${isAnimating ? 'animating' : ''}`}
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
          </Document>
        </div>
      </div>
    </div>
  );
}

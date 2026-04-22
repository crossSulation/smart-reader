import { useEffect, useRef, useState, useCallback, type TouchEvent } from "react";
import { Document, Page } from "react-pdf";
import { useTranslation } from 'react-i18next';
import * as pdfjs from "pdf-dist";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
    return () => {
      const pageToSave = currentPageRef.current;
      if (pageToSave && pageToSave !== lastSavedPageRef.current) {
        saveProgress(pageToSave);
      }
    };
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    const initial = Math.min(Math.max(initPage, 1), numPages);
    setPageNumber(initial);
  }

  const handleMouseUpSelection = useCallback(() => {
    const text = window.getSelection()?.toString().trim() || "";
    if (text) {
      onTextSelected?.(text);
    }
  }, [onTextSelected]);

  return (
    <div className="flex flex-col items-center">
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
        onMouseUp={handleMouseUpSelection}
        className="border shadow-lg rounded-lg overflow-hidden"
        style={{
          touchAction: 'pan-y', // Allow vertical scrolling but prevent horizontal scroll
          userSelect: 'text',
        }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          className="border shadow-lg"
        >
          <Page
            pageNumber={pageNumber}
            width={window.innerWidth * 0.8}
            className={`pdf-page ${isAnimating ? 'animating' : ''}`}
          />
        </Document>
      </div>
    </div>
  );
}

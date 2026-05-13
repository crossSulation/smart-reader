import { useEffect, useRef, useState, useCallback, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';

type EPUBViewerProps = {
  bookId: string;
  initPage?: number;
  onTextSelected?: (text: string) => void;
};

export default function EPUBViewer({ bookId, onTextSelected }: EPUBViewerProps) {
  const { t } = useTranslation();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'next' | 'previous'>('next');
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  useEffect(() => {
    const initializeEpub = async () => {
      try {
        if (!viewerRef.current) {
          throw new Error('Viewer container not found');
        }

        // Dynamically import epubjs to avoid issues
        const EPUBJSModule = await import('epubjs');
        const EPUBJS = EPUBJSModule.default;

        // Fetch the EPUB file URL
        const res = await fetch(`/api/books/${bookId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (!res.ok) {
          throw new Error('Failed to fetch book');
        }

        const data = await res.json();
        const fileUrl = data.file_url;

        // Create the book - use the default export directly
        const book = EPUBJS(fileUrl);
        bookRef.current = book;

        // Create rendition
        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '600px',
          spread: 'none',
        });

        renditionRef.current = rendition;

        // Display the book
        await rendition.display();

        // Save progress on page change
        rendition.on('relocated', async (location: any) => {
          try {
            await fetch(`/api/books/${bookId}/progress`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
              body: JSON.stringify({ current_page: location.start.index || 0 }),
            });
          } catch (err) {
            console.error('Failed to save progress:', err);
          }
        });

        // Capture selected text from the EPUB iframe and pass to parent.
        rendition.on('selected', (_cfiRange: string, contents: any) => {
          try {
            const text = contents?.window?.getSelection?.()?.toString?.().trim?.() || '';
            if (text) {
              onTextSelected?.(text);
            }
          } catch {
            // Ignore selection extraction errors; reading must continue.
          }
        });

        setLoading(false);
      } catch (err) {
        console.error('EPUB Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load EPUB');
        setLoading(false);
      }
    };

    initializeEpub();

    return () => {
      if (renditionRef.current) {
        renditionRef.current.destroy?.();
      }
    };
  }, [bookId, onTextSelected]);

  const handlePrevious = useCallback(() => {
    if (renditionRef.current && !isAnimating) {
      setAnimationDirection('previous');
      setIsAnimating(true);
      renditionRef.current.prev();
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [isAnimating]);

  const handleNext = useCallback(() => {
    if (renditionRef.current && !isAnimating) {
      setAnimationDirection('next');
      setIsAnimating(true);
      renditionRef.current.next();
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [isAnimating]);

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
        handleNext();
      } else {
        // Swipe right - previous page
        handlePrevious();
      }
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
  }, [handleNext, handlePrevious, isAnimating]);

  if (loading) return <div className="text-center py-8">Loading EPUB...</div>;

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">{error}</div>
        <p className="text-gray-600">Failed to load EPUB file</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex gap-4">
        <button
          onClick={handlePrevious}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition disabled:opacity-50"
          disabled={isAnimating}
        >
          Previous
        </button>
        <button
          onClick={handleNext}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition disabled:opacity-50"
          disabled={isAnimating}
        >
          Next
        </button>
      </div>

      <div className="mb-2 text-sm text-gray-500 text-center">
        {t('pdfViewer.swipeHint')}
      </div>

      <div
        ref={viewerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`border shadow-lg rounded-lg overflow-auto bg-white epub-viewer ${isAnimating ? `animating animating-${animationDirection}` : ''}`}
        style={{
          width: '100%',
          maxWidth: '900px',
          minHeight: '600px',
          touchAction: 'pan-y', // Allow vertical scrolling but prevent horizontal scroll
          userSelect: 'text',
        }}
      />
    </div>
  );
}
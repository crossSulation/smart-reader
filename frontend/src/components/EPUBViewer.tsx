import { useEffect, useRef, useState, useCallback, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';

type EPUBNavItem = {
  label: string;
  href: string;
  subitems?: EPUBNavItem[];
};

type EPUBViewerProps = {
  bookId?: string;
  fileUrlOverride?: string;
  jumpToHref?: string;
  onTextSelected?: (text: string) => void;
  onProgressChange?: (percent: number) => void;
  showSidebar?: boolean;
};

function NavTree({
  items,
  depth,
  activeHref,
  onNavigate,
}: {
  items: EPUBNavItem[];
  depth: number;
  activeHref: string | null;
  onNavigate: (href: string) => void;
}) {
  return (
    <ul className={depth === 0 ? '' : 'pl-3'}>
      {items.map((item) => (
        <li key={item.href || item.label}>
          <button
            type="button"
            onClick={() => item.href && onNavigate(item.href)}
            className={`block w-full truncate rounded px-2 py-1 text-left text-sm transition ${
              activeHref === item.href
                ? 'bg-white font-medium text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                : 'text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            title={item.label}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <NavTree items={item.subitems} depth={depth + 1} activeHref={activeHref} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  );
}

export default function EPUBViewer({
  bookId,
  fileUrlOverride,
  jumpToHref,
  onTextSelected,
  onProgressChange,
  showSidebar = false,
}: EPUBViewerProps) {
  const { t } = useTranslation();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navItems, setNavItems] = useState<EPUBNavItem[]>([]);
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const prevJumpHrefRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const initializeEpub = async () => {
      try {
        const container = viewerRef.current;
        if (cancelled || !container) return;

        const EPUBJSModule = await import('epubjs');
        if (cancelled) return;
        const EPUBJS = EPUBJSModule.default;

        let resolvedFileUrl = fileUrlOverride;
        if (!resolvedFileUrl) {
          if (!bookId) {
            throw new Error('Missing book id and local file URL');
          }

          const res = await fetch(`/api/books/${bookId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          });
          if (cancelled) return;

          if (!res.ok) {
            throw new Error('Failed to fetch book');
          }

          const data = await res.json();
          resolvedFileUrl = data.file_url;
        }

        if (!resolvedFileUrl) {
          throw new Error('Failed to resolve EPUB file URL');
        }

        // Fetch the EPUB file with auth token, then pass as Blob URL to epubjs
        const token = localStorage.getItem("token");
        const epubRes = await fetch(resolvedFileUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!epubRes.ok) {
          throw new Error(`Failed to download EPUB (${epubRes.status})`);
        }
        const buffer = await epubRes.arrayBuffer();
        if (cancelled) return;

        const book = EPUBJS(buffer);
        bookRef.current = book;

        // Wait for the book to finish parsing before rendering
        const readyPromise = book.ready;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('EPUB loading timed out')), 30000),
        );
        await Promise.race([readyPromise, timeout]);

        const rendition = book.renderTo(container, {
          width: '100%',
          height: '100%',
          spread: 'none',
        });

        renditionRef.current = rendition;
        let location = localStorage.getItem(`epub-location-${bookId}`);
        if (location) {
          await rendition.display(location).catch(() => rendition.display());
        } else {
          await rendition.display();
        }

        // epubjs creates an internal iframe; ensure scripts are allowed for rendering
        const iframe = container.querySelector('iframe');
        if (iframe && iframe.sandbox) {
          iframe.sandbox.add('allow-scripts');
          iframe.sandbox.add('allow-same-origin');
        }

        // Extract TOC
        const bookAny = book as any;
        const nav: EPUBNavItem[] = bookAny.loaded?.navigation?.toc || [];
        setNavItems(nav);
        if (nav.length === 0) {
          try {
            const resolved: any = await bookAny.navigation;
            if (resolved?.toc) {
              setNavItems(resolved.toc);
            }
          } catch {
            // TOC unavailable
          }
        }

        // Track current location
        rendition.on('relocated', (location: any) => {
          try {
            // Re-ensure iframe sandbox allows scripts
            const iframe = container.querySelector('iframe');
            if (iframe?.sandbox) {
              iframe.sandbox.add('allow-scripts');
              iframe.sandbox.add('allow-same-origin');
            }

            let percent = 0;

            // Calculate from spine position and displayed page within section
            const displayed = location.start?.displayed;
            const index = location.start?.index;
            const spineLength = bookAny.spine?.length || bookAny.loaded?.spine?.items?.length;
            if (typeof index === 'number' && spineLength) {
              if (displayed?.page && displayed?.total) {
                const sectionFrac = index / Math.max(1, spineLength);
                const pageFrac = (displayed.page - 1) / displayed.total;
                percent = sectionFrac + pageFrac / spineLength;
              } else {
                percent = (index + 1) / spineLength;
              }
            } else if (typeof location.start?.percentage === 'number' && location.start.percentage > 0) {
              // Fall back to epubjs percentage if spine data unavailable
              percent = location.start.percentage;
            }

            const pct = Math.round(Math.min(1, Math.max(0, percent)) * 100);
            onProgressChange?.(pct);

            const href = location.start?.href || null;
            const cfi = location.start?.cfi || null;
            setActiveHref(href);
            
            if (bookId) {
              localStorage.setItem(`epub-location-${bookId}`, cfi || '');
              fetch(`/api/books/${bookId}/progress`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({ current_page: pct }),
              }).catch(() => {});
            }
          } catch {
            // Ignore progress save errors
          }
        });

        // Capture selected text
        rendition.on('selected', (_cfiRange: string, contents: any) => {
          try {
            const text = contents?.window?.getSelection?.()?.toString?.().trim?.() || '';
            if (text) {
              onTextSelected?.(text);
            }
          } catch {
            // Ignore selection extraction errors
          }
        });

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('EPUB Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load EPUB');
        setLoading(false);
      }
    };

    initializeEpub();

    return () => {
      cancelled = true;
      if (renditionRef.current) {
        renditionRef.current.destroy?.();
      }
    };
  }, [bookId, fileUrlOverride, onTextSelected]);

  // Jump to href when prop changes
  useEffect(() => {
    if (!jumpToHref || jumpToHref === prevJumpHrefRef.current) return;
    prevJumpHrefRef.current = jumpToHref;
    if (renditionRef.current) {
      renditionRef.current.display(jumpToHref);
    }
  }, [jumpToHref]);

  const handlePrevious = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const handleNavigate = useCallback((href: string) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
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
        handleNext();
      } else {
        handlePrevious();
      }
    }

    touchStartX.current = 0;
    touchStartY.current = 0;
  }, [handleNext, handlePrevious]);

  const navContent = navItems.length > 0 && (
    <div className="p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Contents
      </div>
      <nav className="space-y-0.5">
        <NavTree items={navItems} depth={0} activeHref={activeHref} onNavigate={handleNavigate} />
      </nav>
    </div>
  );

  return (
    <div className="flex h-full w-full">
      {showSidebar && navItems.length > 0 && (
        <aside className="hidden h-full w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 lg:block dark:border-gray-700 dark:bg-gray-800">
          {navContent}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col items-center">
        {!showSidebar && navItems.length > 0 && (
          <div className="w-full border-b border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
            <details>
              <summary className="cursor-pointer px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Contents
              </summary>
              <nav className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
                <NavTree items={navItems} depth={0} activeHref={activeHref} onNavigate={handleNavigate} />
              </nav>
            </details>
          </div>
        )}

        <div className="mb-4 flex gap-4 pt-4">
          <button
            onClick={handlePrevious}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
          >
            {t('pdfViewer.previous')}
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
          >
            {t('pdfViewer.next')}
          </button>
        </div>

        <div className="mb-2 text-sm text-gray-500 text-center dark:text-gray-400">
          {t('pdfViewer.swipeHint')}
        </div>

        <div className="relative w-full flex-1" style={{ maxWidth: '900px', minHeight: '400px' }}>
          {error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/90 dark:bg-gray-800/90">
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Failed to load EPUB file</span>
            </div>
          )}
          {!error && loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 dark:bg-gray-800/80">
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading EPUB...</span>
            </div>
          )}
          <div
            ref={viewerRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          className="border shadow-lg rounded-lg overflow-auto bg-white epub-viewer dark:border-gray-600 dark:bg-gray-800"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '400px',
            touchAction: 'pan-y',
            userSelect: 'text',
          }}
        />
        </div>
      </div>
    </div>
  );
}

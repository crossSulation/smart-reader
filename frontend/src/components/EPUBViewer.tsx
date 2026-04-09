import { useEffect, useRef, useState } from 'react';

type EPUBViewerProps = {
  bookId: string;
  initPage?: number;
};

export default function EPUBViewer({ bookId }: EPUBViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);

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
              body: JSON.stringify({ page: location.start.index || 0 }),
            });
          } catch (err) {
            console.error('Failed to save progress:', err);
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
  }, [bookId]);

  const handlePrevious = () => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  };

  const handleNext = () => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  };

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
        >
          Previous
        </button>
        <button
          onClick={handleNext}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <div
        ref={viewerRef}
        className="border shadow-lg rounded-lg overflow-auto bg-white"
        style={{
          width: '100%',
          maxWidth: '900px',
          minHeight: '600px',
        }}
      />
    </div>
  );
}
import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import * as pdfjs from "pdf-dist";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PDFViewerProps = {
  bookId: string;
  initPage?: number;
};
export default function PDFViewer({ bookId, initPage = 1 }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [fileUrl, setFileUrl] = useState("");
  const currentPageRef = useRef<number>(1);
  const lastSavedPageRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchFile = async () => {
      const res = await fetch(`/api/books/${bookId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      const url = data.file_url;
      setFileUrl(url);
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
        body: JSON.stringify({ page }),
      });
      lastSavedPageRef.current = page;
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  };

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

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))}
          disabled={pageNumber <= 1}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          previous
        </button>
        <span>
           Page {pageNumber} / {numPages || "?"}
        </span>
        <button
          onClick={() => setPageNumber((prev) => Math.min(prev + 1, numPages))}
          disabled={pageNumber >= numPages}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          next
        </button>
      </div>

      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        className="border shadow-lg"
      >
        <Page
          pageNumber={pageNumber}
          width={window.innerWidth * 0.8}
        />
      </Document>
    </div>
  );
}

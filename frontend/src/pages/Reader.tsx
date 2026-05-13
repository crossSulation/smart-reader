import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowBack, AutoAwesomeOutlined, LocalOfferOutlined, SettingsOutlined, ViewSidebarOutlined } from "@mui/icons-material";
import { Document, Page, pdfjs } from "react-pdf";
import PDFViewer from "../components/PDFViewer";
import EPUBViewer from "../components/EPUBViewer";
import BookSearch from "../components/BookSearch";
import BookQA from "../components/BookQA";
import type { Book } from "../types/Book";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpToPage, setJumpToPage] = useState<number | undefined>(undefined);
  const [aiTab, setAiTab] = useState<"search" | "ai">("search");
  const [leftPanelTab, setLeftPanelTab] = useState<"thumbnails" | "tags">("thumbnails");
  const [prefillReferenceTerm, setPrefillReferenceTerm] = useState("");
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleTextSelected = (text: string) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean) return;
    setPrefillReferenceTerm(clean.slice(0, 200));
    setAiTab("ai");
  };

  useEffect(() => {
    if (!id) {
      setError("Book ID not found");
      setLoading(false);
      return;
    }

    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/books/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to load book: ${res.status}`);
        }

        const data = await res.json();
        setBook(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  const normalizedFileType = (
    book?.file_type ||
    (book?.title?.toLowerCase().endsWith(".epub") ? "epub" : "pdf")
  ).toLowerCase();

  const thumbnailFile = book?.file_url
    ? {
        url: book.file_url,
        httpHeaders: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }
    : null;

  useEffect(() => {
    if (!book || normalizedFileType !== "pdf") {
      setCurrentPdfPage(1);
      setPdfTotalPages(0);
      return;
    }

    const initialPage = Math.max(1, book.current_page ?? 1);
    setCurrentPdfPage(initialPage);
  }, [book, normalizedFileType]);

  useEffect(() => {
    if (normalizedFileType !== "pdf") return;
    thumbnailRefs.current[currentPdfPage - 1]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPdfPage, normalizedFileType]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">{error}</div>
        <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
          ← Back to Bookshelf
        </button>
      </div>
    );
  }

  if (!book) return <div className="p-8 text-center">Book not found</div>;

  const renderReaderContent = () =>
    normalizedFileType === "pdf" ? (
      <PDFViewer
        bookId={id!}
        initPage={jumpToPage ?? book.current_page}
        jumpToPage={jumpToPage}
        onTextSelected={handleTextSelected}
        onPageChange={setCurrentPdfPage}
        onTotalPagesChange={setPdfTotalPages}
      />
    ) : (
      <EPUBViewer bookId={id!} onTextSelected={handleTextSelected} />
    );

  const renderAiPanel = () => (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <AutoAwesomeOutlined fontSize="small" />
          <span>AI Panel</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 px-3 pt-3 bg-gray-50">
        {(["search", "ai"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setAiTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition ${
              aiTab === tab
                ? "bg-white border border-b-white border-gray-200 -mb-px text-blue-700"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab === "search" ? "Search" : "AI Assistant"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {aiTab === "search" ? (
          <BookSearch bookId={id!} onJumpToPage={(page) => setJumpToPage(page)} />
        ) : (
          <BookQA
            bookId={id!}
            onJumpToPage={(page) => setJumpToPage(page)}
            prefillReferenceTerm={prefillReferenceTerm}
          />
        )}
      </div>
    </>
  );

  const currentPageDisplay = normalizedFileType === "pdf"
    ? currentPdfPage
    : Math.max(1, book.current_page ?? 1);
  const totalPageDisplay = normalizedFileType === "pdf"
    ? (pdfTotalPages || book.total_pages || "?")
    : (book.total_pages || "?");
  const totalPagesNumber = typeof totalPageDisplay === "number" ? totalPageDisplay : null;
  const progressPercent = totalPagesNumber
    ? Math.min(100, Math.max(0, (currentPageDisplay / totalPagesNumber) * 100))
    : 0;

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="justify-self-start">
            <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
              <ArrowBack fontSize="small" />
            </button>
          </div>

          <h1 className="max-w-[55vw] truncate text-xl font-bold text-gray-900 md:text-2xl text-center">{book.title}</h1>

          <div className="justify-self-end">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
              title="Reader settings"
            >
              <SettingsOutlined fontSize="small" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
      <div className="flex h-full flex-col lg:hidden overflow-y-auto">
        <div className="min-w-0">{renderReaderContent()}</div>
        <aside className="border-t border-gray-200 bg-white overflow-hidden flex flex-col min-h-[28rem]">
          {renderAiPanel()}
        </aside>
      </div>

      <div className="hidden lg:flex h-full">
        {normalizedFileType === "pdf" && (
          <>
            <aside className="h-full w-20 shrink-0 border-r border-gray-200 bg-white">
              <div className="flex h-full flex-col items-center py-3">
                <button
                  type="button"
                  onClick={() => setLeftPanelTab("thumbnails")}
                  className={`rounded-xl p-3 transition ${
                    leftPanelTab === "thumbnails"
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  title="Thumbnails"
                  aria-label="Thumbnails"
                >
                  <ViewSidebarOutlined fontSize="small" />
                </button>
                <button
                  type="button"
                  onClick={() => setLeftPanelTab("tags")}
                  className={`mt-2 rounded-xl p-3 transition ${
                    leftPanelTab === "tags"
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  title="Tags"
                  aria-label="Tags"
                >
                  <LocalOfferOutlined fontSize="small" />
                </button>
              </div>
            </aside>

            <aside className="h-full w-40 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
              {leftPanelTab === "thumbnails" ? (
                thumbnailFile && pdfTotalPages > 0 && (
                  <Document file={thumbnailFile} loading="">
                    {Array.from({ length: pdfTotalPages }, (_, i) => i + 1).map((page) => (
                      <div
                        key={page}
                        ref={(el) => {
                          thumbnailRefs.current[page - 1] = el;
                        }}
                        onClick={() => setJumpToPage(page)}
                        className={`m-1 cursor-pointer rounded border-2 transition-colors ${
                          currentPdfPage === page
                            ? "border-blue-500 bg-blue-50"
                            : "border-transparent hover:border-blue-300"
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
                )
              ) : (
                <div className="p-2 text-xs text-gray-600">
                  <div className="mb-2 font-semibold text-gray-700">Tags</div>
                  <div className="rounded border border-dashed border-gray-300 bg-white p-2 text-gray-500">
                    No tags yet.
                  </div>
                </div>
              )}
            </aside>
          </>
        )}

        <div className="min-w-0 flex-1 overflow-y-auto">{renderReaderContent()}</div>

        <aside className="h-full w-[480px] max-w-[42vw] min-w-[420px] shrink-0 border-l border-gray-200">
          <div className="flex h-full overflow-hidden bg-white">
            <div className="flex min-w-0 flex-1 flex-col">{renderAiPanel()}</div>
          </div>
        </aside>
      </div>
      </div>

      <footer className="border-t border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">
        <div className="mb-1 flex items-center justify-between">
          <span>Progress</span>
          <span>{currentPageDisplay} / {totalPageDisplay}</span>
        </div>
        <div className="px-6">
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Reader;

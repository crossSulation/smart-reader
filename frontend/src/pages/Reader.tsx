import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowBack, AutoAwesomeOutlined, LocalOfferOutlined, SettingsOutlined, UploadFileOutlined, ViewSidebarOutlined } from "@mui/icons-material";
import { Document, Page, pdfjs } from "react-pdf";
import MarkdownViewer from "../components/MarkdownViewer";
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
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const [learningTagsInput, setLearningTagsInput] = useState("highlight");
  const [learningStatus, setLearningStatus] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [savingFlashcard, setSavingFlashcard] = useState(false);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [markdownJumpSection, setMarkdownJumpSection] = useState<number | undefined>(undefined);
  const [localFile, setLocalFile] = useState<{ name: string; type: "pdf" | "epub" | "markdown"; url: string } | null>(null);
  const [localUploadStatus, setLocalUploadStatus] = useState<"idle" | "uploading" | "uploaded" | "failed">("idle");
  const [localUploadMessage, setLocalUploadMessage] = useState("");
  const [uploadedBookId, setUploadedBookId] = useState<number | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const previousLocalUrlRef = useRef<string | null>(null);

  const handleTextSelected = (text: string) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean) return;
    setSelectedExcerpt(clean.slice(0, 400));
    setPrefillReferenceTerm(clean.slice(0, 200));
    setAiTab("ai");
  };

  const createNoteFromSelection = async () => {
    if (!selectedExcerpt.trim() || !activeBookIdForAi) return;

    setSavingNote(true);
    setLearningStatus(null);
    try {
      const tags = learningTagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await fetch("/api/learning/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          book_id: Number(activeBookIdForAi),
          content: selectedExcerpt,
          source_text: selectedExcerpt,
          page: activeFileType === "pdf" ? currentPdfPage : null,
          tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Create note failed (${res.status})`);
      }

      setLearningStatus("Saved as note.");
    } catch (err) {
      setLearningStatus(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  const createFlashcardFromSelection = async () => {
    if (!selectedExcerpt.trim() || !activeBookIdForAi) return;

    setSavingFlashcard(true);
    setLearningStatus(null);
    try {
      const tags = learningTagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await fetch("/api/learning/flashcards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          book_id: Number(activeBookIdForAi),
          front: selectedExcerpt,
          back: "",
          source_text: selectedExcerpt,
          tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Create flashcard failed (${res.status})`);
      }

      setLearningStatus("Created flashcard. Review it on the Review page.");
    } catch (err) {
      setLearningStatus(err instanceof Error ? err.message : "Failed to create flashcard.");
    } finally {
      setSavingFlashcard(false);
    }
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

  useEffect(() => {
    const previous = previousLocalUrlRef.current;
    if (previous && previous !== localFile?.url) {
      URL.revokeObjectURL(previous);
    }
    previousLocalUrlRef.current = localFile?.url ?? null;
  }, [localFile?.url]);

  useEffect(() => {
    return () => {
      if (previousLocalUrlRef.current) {
        URL.revokeObjectURL(previousLocalUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!uploadedBookId) return;

    const triggerAutoIndex = async () => {
      setIndexing(true);
      try {
        const res = await fetch(`/api/books/${uploadedBookId}/index`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Indexing failed (${res.status})`);
        }
        setLocalUploadMessage("Book indexed and ready for search/AI.");
      } catch {
        setLocalUploadMessage("Indexing failed. You can retry manually.");
      } finally {
        setIndexing(false);
      }
    };

    triggerAutoIndex();
  }, [uploadedBookId]);

  const detectLocalFileType = (fileName: string): "pdf" | "epub" | "markdown" | null => {
    const lowered = fileName.toLowerCase();
    if (lowered.endsWith(".pdf")) return "pdf";
    if (lowered.endsWith(".epub")) return "epub";
    if (lowered.endsWith(".md") || lowered.endsWith(".markdown")) return "markdown";
    return null;
  };

  const handlePickLocalFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;

    const detectedType = detectLocalFileType(picked.name);
    if (!detectedType) {
      setLocalUploadStatus("failed");
      setLocalUploadMessage("Unsupported file type. Please select PDF, EPUB, or Markdown.");
      e.target.value = "";
      return;
    }

    const localUrl = URL.createObjectURL(picked);
    setLocalFile({
      name: picked.name,
      type: detectedType,
      url: localUrl,
    });
    setUploadedBookId(null);
    setJumpToPage(undefined);
    setMarkdownJumpSection(undefined);
    setCurrentPdfPage(1);
    setPdfTotalPages(0);
    setLocalUploadStatus("uploading");
    setLocalUploadMessage("Uploading in background...");

    try {
      const formData = new FormData();
      formData.append("file", picked);

      const res = await fetch("/api/upload/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setUploadedBookId(typeof data.book_id === "number" ? data.book_id : null);
      setLocalUploadStatus("uploaded");
      setLocalUploadMessage("Background upload completed.");
    } catch (err) {
      setLocalUploadStatus("failed");
      setLocalUploadMessage(err instanceof Error ? err.message : "Background upload failed.");
    } finally {
      e.target.value = "";
    }
  };

  const resolveBookFileType = (currentBook: Book | null): "pdf" | "epub" | "markdown" => {
    const rawFileType = (currentBook?.file_type || "").toLowerCase();
    const title = (currentBook?.title || "").toLowerCase();

    if (rawFileType.includes("markdown") || rawFileType === "md") return "markdown";
    if (rawFileType.includes("epub")) return "epub";
    if (rawFileType.includes("pdf")) return "pdf";

    if (title.endsWith(".md") || title.endsWith(".markdown")) return "markdown";
    if (title.endsWith(".epub")) return "epub";
    return "pdf";
  };

  const normalizedFileType = resolveBookFileType(book);
  const activeFileType = localFile?.type ?? normalizedFileType;
  const activeTitle = localFile?.name ?? book?.title ?? "Untitled";

  const activeBookIdForAi = localFile
    ? (uploadedBookId ? String(uploadedBookId) : null)
    : (id ?? null);

  const thumbnailFile = localFile && activeFileType === "pdf"
    ? localFile.url
    : book?.file_url
      ? {
          url: book.file_url,
          httpHeaders: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      : null;

  useEffect(() => {
    if (activeFileType !== "pdf") {
      setCurrentPdfPage(1);
      setPdfTotalPages(0);
      return;
    }

    const initialPage = localFile ? 1 : Math.max(1, book?.current_page ?? 1);
    setCurrentPdfPage(initialPage);
  }, [book, activeFileType, localFile]);

  useEffect(() => {
    if (activeFileType !== "pdf") return;
    thumbnailRefs.current[currentPdfPage - 1]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPdfPage, activeFileType]);

  const handleJumpTarget = (target: number) => {
    if (activeFileType === "markdown") {
      setMarkdownJumpSection(target);
      return;
    }
    setJumpToPage(target);
  };

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
    activeFileType === "pdf" ? (
      <PDFViewer
        bookId={localFile ? undefined : id!}
        fileUrlOverride={localFile?.type === "pdf" ? localFile.url : undefined}
        initPage={jumpToPage ?? book.current_page ?? 1}
        jumpToPage={jumpToPage}
        onTextSelected={handleTextSelected}
        onPageChange={setCurrentPdfPage}
        onTotalPagesChange={setPdfTotalPages}
      />
    ) : activeFileType === "markdown" ? (
      (localFile?.type === "markdown" ? localFile.url : book.file_url) ? (
        <MarkdownViewer
          fileUrl={localFile?.type === "markdown" ? localFile.url : book.file_url!}
          bookId={localFile ? (uploadedBookId ? String(uploadedBookId) : undefined) : id}
          onTextSelected={handleTextSelected}
          jumpToSection={markdownJumpSection}
        />
      ) : null
    ) : (
      <EPUBViewer
        bookId={localFile ? undefined : id!}
        fileUrlOverride={localFile?.type === "epub" ? localFile.url : undefined}
        onTextSelected={handleTextSelected}
      />
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
        {selectedExcerpt && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Selected Text</div>
            <p className="mb-3 line-clamp-3 text-sm text-blue-900">{selectedExcerpt}</p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-blue-800">Tags (comma-separated)</label>
              <input
                type="text"
                value={learningTagsInput}
                onChange={(e) => setLearningTagsInput(e.target.value)}
                placeholder="topic,question,todo"
                className="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs text-blue-900 placeholder:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={createNoteFromSelection}
                disabled={!activeBookIdForAi || savingNote || savingFlashcard}
                className="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingNote ? "Saving..." : "Save as note"}
              </button>
              <button
                type="button"
                onClick={createFlashcardFromSelection}
                disabled={!activeBookIdForAi || savingNote || savingFlashcard}
                className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingFlashcard ? "Creating..." : "Create flashcard"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedExcerpt("")}
                className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white"
              >
                Clear
              </button>
            </div>
            {learningStatus && (
              <div className="mt-2 text-xs text-gray-700">{learningStatus}</div>
            )}
            {!activeBookIdForAi && (
              <div className="mt-2 text-xs text-amber-700">Upload/index must complete before saving learning items.</div>
            )}
          </div>
        )}

        {!activeBookIdForAi ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Local file is open. AI search/QA will be available after background upload finishes.
          </div>
        ) : aiTab === "search" ? (
          <BookSearch bookId={activeBookIdForAi} onJumpToPage={(page) => handleJumpTarget(page)} isIndexing={localFile ? indexing : undefined} />
        ) : (
          <BookQA
            bookId={activeBookIdForAi}
            onJumpToPage={(page) => handleJumpTarget(page)}
            prefillReferenceTerm={prefillReferenceTerm}
          />
        )}
      </div>
    </>
  );

  const currentPageDisplay = activeFileType === "pdf"
    ? currentPdfPage
    : Math.max(1, book.current_page ?? 1);
  const totalPageDisplay = activeFileType === "pdf"
    ? (pdfTotalPages || (!localFile ? book.total_pages : undefined) || "?")
    : ((!localFile ? book.total_pages : undefined) || "?");
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

          <h1 className="max-w-[55vw] truncate text-xl font-bold text-gray-900 md:text-2xl text-center">{activeTitle}</h1>

          <div className="justify-self-end">
            <div className="flex items-center gap-2">
              {(localUploadStatus !== "idle" || indexing) && (
                <span className={`rounded px-2 py-1 text-xs font-medium ${
                  localUploadStatus === "uploading"
                    ? "bg-blue-50 text-blue-700"
                    : indexing
                      ? "bg-purple-50 text-purple-700"
                      : localUploadStatus === "uploaded"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                }`}>
                  {localUploadStatus === "uploading"
                    ? "Uploading"
                    : indexing
                      ? "Indexing…"
                      : localUploadStatus === "uploaded"
                        ? "Indexed"
                        : "Upload failed"}
                </span>
              )}
              <input
                ref={localFileInputRef}
                type="file"
                accept=".pdf,.epub,.md,.markdown"
                onChange={handlePickLocalFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => localFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
                title="Open local file"
              >
                <UploadFileOutlined fontSize="small" />
                Open local
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
                title="Reader settings"
              >
                <SettingsOutlined fontSize="small" />
              </button>
            </div>
          </div>
        </div>
        {localUploadMessage && (
          <div className="mt-2 text-xs text-gray-500">{localUploadMessage}</div>
        )}
      </header>

      <div className="flex-1 min-h-0">
      {!isDesktop ? (
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="min-w-0">{renderReaderContent()}</div>
          <aside className="border-t border-gray-200 bg-white overflow-hidden flex flex-col min-h-[28rem]">
            {renderAiPanel()}
          </aside>
        </div>
      ) : (
        <div className="flex h-full">
          {activeFileType === "pdf" && (
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
      )}
      </div>

      {activeFileType !== "markdown" && (
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
      )}
    </div>
  );
}

export default Reader;

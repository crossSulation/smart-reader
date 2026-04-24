import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AutoAwesomeOutlined, ChevronLeftOutlined, ChevronRightOutlined, PushPin, PushPinOutlined } from "@mui/icons-material";
import PDFViewer from "../components/PDFViewer";
import EPUBViewer from "../components/EPUBViewer";
import BookSearch from "../components/BookSearch";
import BookQA from "../components/BookQA";
import type { Book } from "../types/Book";

function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpToPage, setJumpToPage] = useState<number | undefined>(undefined);
  const [aiTab, setAiTab] = useState<"search" | "ai">("search");
  const [prefillReferenceTerm, setPrefillReferenceTerm] = useState("");
  const [isDockOpen, setIsDockOpen] = useState(true);
  const [isDockPinned, setIsDockPinned] = useState(true);

  const handleTextSelected = (text: string) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean) return;
    setPrefillReferenceTerm(clean.slice(0, 200));
    setAiTab("ai");
    setIsDockOpen(true);
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

  const normalizedFileType = (
    book.file_type ||
    (book.title.toLowerCase().endsWith(".epub") ? "epub" : "pdf")
  ).toLowerCase();

  const renderReaderContent = () =>
    normalizedFileType === "pdf" ? (
      <PDFViewer
        bookId={id!}
        initPage={jumpToPage ?? book.current_page}
        jumpToPage={jumpToPage}
        onTextSelected={handleTextSelected}
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
        <button
          onClick={() => setIsDockPinned((current) => !current)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
            isDockPinned
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
          title={isDockPinned ? "Unpin panel" : "Pin panel"}
        >
          {isDockPinned ? <PushPin fontSize="inherit" /> : <PushPinOutlined fontSize="inherit" />}
          {isDockPinned ? "Pinned" : "Floating"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 px-3 pt-3 bg-gray-50">
        {(["search", "ai"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setAiTab(tab);
              setIsDockOpen(true);
            }}
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

  return (
    <div className="h-screen overflow-hidden p-4 md:p-6 lg:pl-8 lg:pr-0 lg:py-8">
      <div className="mb-4">
        <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
          ← Back to Bookshelf
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-4">{book.title}</h1>

      <div className="flex flex-col gap-6 h-[calc(100%-5.5rem)] lg:hidden overflow-y-auto">
        <div className="min-w-0">{renderReaderContent()}</div>
        <aside className="border border-gray-200 rounded-xl bg-white overflow-hidden flex flex-col min-h-[28rem]">
          {renderAiPanel()}
        </aside>
      </div>

      <div className="hidden lg:block relative h-[calc(100%-5.5rem)]">
        <div
          className={`h-full min-w-0 overflow-y-auto transition-[margin-right] duration-300 ${
            isDockOpen && isDockPinned ? "mr-[480px]" : "mr-0"
          }`}
        >
          {renderReaderContent()}
        </div>

        <aside
          className={`absolute right-0 top-0 z-10 h-full w-[480px] max-w-[42vw] min-w-[420px] transition-transform duration-300 ${
            isDockOpen ? "translate-x-0" : "translate-x-[428px]"
          }`}
        >
          <div className="flex h-full overflow-hidden rounded-l-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex w-14 flex-col items-center justify-between border-r border-slate-700 bg-slate-900 py-4 text-white">
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => setIsDockOpen((current) => !current)}
                  className="rounded-xl bg-white/10 p-2 transition hover:bg-white/20"
                  title={isDockOpen ? "Hide panel" : "Show panel"}
                >
                  {isDockOpen ? <ChevronRightOutlined fontSize="small" /> : <ChevronLeftOutlined fontSize="small" />}
                </button>
                <button
                  onClick={() => {
                    setIsDockPinned((current) => !current);
                    setIsDockOpen(true);
                  }}
                  className={`rounded-xl p-2 transition ${
                    isDockPinned ? "bg-blue-500 text-white" : "bg-white/10 hover:bg-white/20"
                  }`}
                  title={isDockPinned ? "Unpin panel" : "Pin panel"}
                >
                  {isDockPinned ? <PushPin fontSize="small" /> : <PushPinOutlined fontSize="small" />}
                </button>
              </div>

              <div className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300">
                AI Dock
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">{renderAiPanel()}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Reader;

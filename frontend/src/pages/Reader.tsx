import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

  if (loading) return <div className="p-8 text-center">加载中...</div>;

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">{error}</div>
        <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
          返回书架
        </button>
      </div>
    );
  }

  if (!book) return <div className="p-8 text-center">书籍未找到</div>;

  const normalizedFileType = (
    book.file_type ||
    (book.title.toLowerCase().endsWith(".epub") ? "epub" : "pdf")
  ).toLowerCase();

  return (
    <div className="p-4 md:p-6 lg:p-8 h-full overflow-hidden">
      <div className="mb-4">
        <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
          ← 返回书架
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-4">{book.title}</h1>

      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100%-5.5rem)]">
        <div className="flex-1 min-w-0 overflow-y-auto pr-0 lg:pr-2">
          {normalizedFileType === "pdf" ? (
            <PDFViewer
              bookId={id!}
              initPage={jumpToPage ?? book.current_page}
              jumpToPage={jumpToPage}
              onTextSelected={handleTextSelected}
            />
          ) : (
            <EPUBViewer bookId={id!} onTextSelected={handleTextSelected} />
          )}
        </div>

        {/* AI panel as right sidebar */}
        <aside className="w-full lg:w-[400px] lg:min-w-[360px] lg:max-w-[420px] border border-gray-200 rounded-xl bg-white overflow-hidden lg:self-start">
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
                {tab === "search" ? "🔍 Search" : "✨ AI Assistant"}
              </button>
            ))}
          </div>

          <div className="p-4 max-h-[70vh] lg:max-h-[calc(100vh-15rem)] overflow-y-auto">
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
        </aside>
      </div>
    </div>
  );
}

export default Reader;

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
    <div className="p-8">
      <div className="mb-4">
        <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
          ← 返回书架
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-4">{book.title}</h1>

      {/* AI panel — tabbed: Search | AI Assistant */}
      <div className="flex gap-1 mb-0 border-b border-gray-200">
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
      <div className="mb-4 border border-gray-200 rounded-b rounded-tr p-4 bg-white">
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
  );
}

export default Reader;

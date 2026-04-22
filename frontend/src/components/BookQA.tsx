import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AutoAwesomeOutlined } from "@mui/icons-material";

type Source = {
  chunk_id: number;
  chunk_index: number;
  text: string;
  page_start: number | null;
  page_end: number | null;
  score: number;
};

type QAResponse = {
  question: string;
  answer: string;
  sources: Source[];
  provider: string;
};

type SummaryResponse = {
  book_id: number;
  title: string;
  summary: string;
  provider: string;
  chunks_used: number;
};

type WebReferenceItem = {
  title: string;
  snippet: string;
  url: string;
  source: string;
};

type WebReferenceResponse = {
  term: string;
  references: WebReferenceItem[];
};

type BookQAProps = {
  bookId: string;
  onJumpToPage?: (page: number) => void;
  prefillReferenceTerm?: string;
};

export default function BookQA({ bookId, onJumpToPage, prefillReferenceTerm }: BookQAProps) {
  const { t } = useTranslation();

  // Q&A state
  const [question, setQuestion] = useState("");
  const [qaResult, setQaResult] = useState<QAResponse | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  // Summary state
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Web reference state
  const [term, setTerm] = useState("");
  const [references, setReferences] = useState<WebReferenceItem[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  useEffect(() => {
    const next = (prefillReferenceTerm || "").trim();
    if (!next) return;
    setTerm(next);
    setReferenceError(null);
  }, [prefillReferenceTerm]);

  const handleAskSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setQaLoading(true);
    setQaError(null);
    setQaResult(null);
    try {
      const res = await fetch(`/api/books/${bookId}/qa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ question, top_k: 5 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Q&A failed (${res.status})`);
      }
      const data: QAResponse = await res.json();
      setQaResult(data);
    } catch (err) {
      setQaError(err instanceof Error ? err.message : "Q&A failed");
    } finally {
      setQaLoading(false);
    }
  };

  const handleSummarise = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch(`/api/books/${bookId}/summary`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Summary failed (${res.status})`);
      }
      const data: SummaryResponse = await res.json();
      setSummary(data);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Summary failed");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleReferenceSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    setReferenceLoading(true);
    setReferenceError(null);
    setReferences([]);

    try {
      const res = await fetch(`/api/books/${bookId}/web-reference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ term, limit: 3 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Web reference failed (${res.status})`);
      }

      const data: WebReferenceResponse = await res.json();
      setReferences(data.references || []);
      if (!data.references || data.references.length === 0) {
        setReferenceError(t("ai.referenceEmpty", "No web references found."));
      }
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : "Web reference failed");
    } finally {
      setReferenceLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50 mb-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <AutoAwesomeOutlined fontSize="small" />
        {t("ai.title", "AI Assistant")}
      </h2>

      {/* Q&A section */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          {t("ai.qaTitle", "Ask a Question")}
        </h3>
        <form onSubmit={handleAskSubmit} className="flex gap-2 mb-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("ai.qaPlaceholder", "Ask anything about this book…")}
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
          <button
            type="submit"
            disabled={qaLoading || !question.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {qaLoading ? "…" : t("ai.askButton", "Ask")}
          </button>
        </form>

        {qaError && <p className="text-sm text-red-600 mb-2">{qaError}</p>}

        {qaResult && (
          <div className="space-y-3">
            <div className="bg-white border rounded p-3">
              <p className="text-sm font-medium text-gray-500 mb-1">
                {t("ai.answer", "Answer")}
                <span className="ml-2 text-xs text-gray-400">({qaResult.provider})</span>
              </p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{qaResult.answer}</p>
            </div>

            {qaResult.sources.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  {t("ai.sources", "Sources used")}
                </p>
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {qaResult.sources.map((s) => (
                    <li key={s.chunk_id} className="bg-gray-100 rounded p-2 text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-500">
                          {s.page_start !== null
                            ? `${t("search.page", "Page")} ${s.page_start}`
                            : `${t("search.chunk", "Chunk")} ${s.chunk_index + 1}`}
                          {" · "}
                          <span className="text-green-600">
                            {(s.score * 100).toFixed(1)}%
                          </span>
                        </span>
                        {s.page_start !== null && onJumpToPage && (
                          <button
                            onClick={() => onJumpToPage(s.page_start!)}
                            className="text-blue-600 hover:underline"
                          >
                            {t("search.goToPage", "Go to page")}
                          </button>
                        )}
                      </div>
                      <p className="text-gray-700 line-clamp-2">{s.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary section */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            {t("ai.summaryTitle", "Book Summary")}
          </h3>
          <button
            onClick={handleSummarise}
            disabled={summaryLoading}
            className="px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 text-xs"
          >
            {summaryLoading
              ? t("ai.summarising", "Summarising…")
              : summary
              ? t("ai.regenerate", "Regenerate")
              : t("ai.summariseButton", "Summarise")}
          </button>
        </div>

        {summaryError && (
          <p className="text-sm text-red-600 mb-2">{summaryError}</p>
        )}

        {summary && (
          <div className="bg-white border rounded p-3">
            <p className="text-xs text-gray-400 mb-2">
              {summary.chunks_used} {t("ai.chunksUsed", "passages used")} · {summary.provider}
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{summary.summary}</p>
          </div>
        )}
      </div>

      {/* Web reference section */}
      <div className="border-t pt-4 mt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          {t("ai.referenceTitle", "Web Reference")}
        </h3>
        <form onSubmit={handleReferenceSearch} className="flex gap-2 mb-3">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("ai.referencePlaceholder", "Type an unfamiliar concept…")}
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="submit"
            disabled={referenceLoading || !term.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {referenceLoading
              ? t("ai.searching", "Searching…")
              : t("ai.referenceButton", "Find")}
          </button>
        </form>

        {referenceError && <p className="text-sm text-red-600 mb-2">{referenceError}</p>}

        {references.length > 0 && (
          <ul className="space-y-2">
            {references.map((item) => (
              <li key={`${item.source}-${item.url}`} className="bg-white border rounded p-3">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-indigo-700 hover:underline"
                >
                  {item.title}
                </a>
                <p className="text-xs text-gray-500 mt-1 mb-2">{item.source}</p>
                <p className="text-sm text-gray-700 line-clamp-4">{item.snippet}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

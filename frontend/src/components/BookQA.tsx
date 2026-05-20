import { isValidElement, useEffect, useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AutoAwesomeOutlined, ErrorOutline, CheckCircleOutline, WarningAmberOutlined } from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SmilesDrawer from "smiles-drawer";
import "katex/dist/katex.min.css";

type Source = {
  chunk_id: number;
  chunk_index: number;
  text: string;
  page_start: number | null;
  page_end: number | null;
  score: number;
};

type Citation = {
  book_id: number;
  chunk_id: number;
  page: number | null;
  section_path: string | null;
  quote: string;
  score: number;
};

type QAResponse = {
  question: string;
  answer: string;
  citations: Citation[];
  confidence: number;
  insufficient_evidence: boolean;
  sources: Source[];
  provider: string;
};

type SummaryBulletSection = {
  heading: string;
  bullets: string[];
};

type SummaryCornellSchema = {
  template: "cornell";
  cue_questions: string[];
  notes: string[];
  summary: string[];
};

type SummaryBulletPointsSchema = {
  template: "bullet_points";
  sections: SummaryBulletSection[];
};

type SummarySQ3RSchema = {
  template: "sq3r";
  survey: string[];
  question: string[];
  read: string[];
  recite: string[];
  review: string[];
};

type SummarySchema = SummaryCornellSchema | SummaryBulletPointsSchema | SummarySQ3RSchema;

type SummaryResponse = {
  book_id: number;
  title: string;
  template: "cornell" | "bullet_points" | "sq3r";
  summary_json: SummarySchema;
  raw_output: string;
  provider: string;
  chunks_used: number;
};

type SummaryTemplate = "cornell" | "bullet_points" | "sq3r";

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

type SmilesBlockProps = {
  smiles: string;
};

function SmilesBlock({ smiles }: SmilesBlockProps) {
  const targetId = useId().replace(/:/g, "_");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleaned = smiles.trim();
    if (!cleaned) {
      return;
    }

    const container = document.getElementById(targetId);
    if (!container) {
      return;
    }

    container.innerHTML = "";
    setError(null);

    SmilesDrawer.parse(
      cleaned,
      (tree: unknown) => {
        try {
          const drawer = new SmilesDrawer.Drawer({
            width: 360,
            height: 220,
            compactDrawing: true,
          });
          drawer.draw(tree, targetId, "light", false);
        } catch {
          setError("Failed to render SMILES diagram.");
        }
      },
      () => {
        setError("Invalid SMILES syntax.");
      },
    );
  }, [smiles, targetId]);

  if (error) {
    return (
      <div className="border border-amber-300 bg-amber-50 text-amber-800 text-xs rounded px-2 py-1">
        {error}
      </div>
    );
  }

  return <div id={targetId} className="bg-white rounded border p-2 overflow-x-auto" />;
}

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
  const [summaryTemplate, setSummaryTemplate] = useState<SummaryTemplate>("bullet_points");

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
      const res = await fetch(`/api/books/${bookId}/summary?template=${encodeURIComponent(summaryTemplate)}`, {
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

  const renderSummary = (summaryData: SummarySchema) => {
    if (summaryData.template === "cornell") {
      return (
        <div className="space-y-3 text-sm text-gray-800">
          <div>
            <p className="font-semibold text-gray-600 mb-1">Cue / Questions</p>
            <ul className="list-disc ml-5 space-y-1">
              {summaryData.cue_questions.map((item, idx) => <li key={`cq-${idx}`}>{item}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-600 mb-1">Notes</p>
            <ul className="list-disc ml-5 space-y-1">
              {summaryData.notes.map((item, idx) => <li key={`note-${idx}`}>{item}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-600 mb-1">Summary</p>
            <ul className="list-disc ml-5 space-y-1">
              {summaryData.summary.map((item, idx) => <li key={`summary-${idx}`}>{item}</li>)}
            </ul>
          </div>
        </div>
      );
    }

    if (summaryData.template === "sq3r") {
      const sq3rGroups = [
        { label: "Survey", items: summaryData.survey },
        { label: "Question", items: summaryData.question },
        { label: "Read", items: summaryData.read },
        { label: "Recite", items: summaryData.recite },
        { label: "Review", items: summaryData.review },
      ];

      return (
        <div className="space-y-3 text-sm text-gray-800">
          {sq3rGroups.map((group) => (
            <div key={group.label}>
              <p className="font-semibold text-gray-600 mb-1">{group.label}</p>
              <ul className="list-disc ml-5 space-y-1">
                {group.items.map((item, idx) => <li key={`${group.label}-${idx}`}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3 text-sm text-gray-800">
        {summaryData.sections.map((section, idx) => (
          <div key={`${section.heading}-${idx}`}>
            <p className="font-semibold text-gray-600 mb-1">{section.heading}</p>
            <ul className="list-disc ml-5 space-y-1">
              {section.bullets.map((item, bIdx) => <li key={`${section.heading}-${bIdx}`}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    );
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
            {/* Confidence indicator and insufficient evidence warning */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {qaResult.insufficient_evidence ? (
                  <>
                    <WarningAmberOutlined className="text-amber-600" fontSize="small" />
                    <span className="text-xs text-amber-600">
                      {t("ai.insufficientEvidence", "Low confidence - limited evidence")}
                    </span>
                  </>
                ) : qaResult.confidence >= 0.7 ? (
                  <>
                    <CheckCircleOutline className="text-green-600" fontSize="small" />
                    <span className="text-xs text-green-600">
                      {t("ai.highConfidence", "High confidence")}
                    </span>
                  </>
                ) : (
                  <>
                    <ErrorOutline className="text-amber-600" fontSize="small" />
                    <span className="text-xs text-amber-600">
                      {t("ai.mediumConfidence", "Medium confidence")}
                    </span>
                  </>
                )}
              </div>
              <span className="text-xs text-gray-500">
                ({qaResult.provider}) · {(qaResult.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>

            {/* Answer with markdown rendering */}
            <div className="bg-white border rounded p-3">
              <p className="text-sm font-medium text-gray-500 mb-2">
                {t("ai.answer", "Answer")}
              </p>
              <div className="text-sm text-gray-800 prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: (props) => <p className="mb-2" {...props} />,
                    li: (props) => <li className="ml-4" {...props} />,
                    ul: (props) => <ul className="list-disc" {...props} />,
                    ol: (props) => <ol className="list-decimal ml-4" {...props} />,
                    code: ({ className, children, ...props }) => {
                      const isSmiles = /language-(smiles|smi)\b/.test(className || "");
                      if (isSmiles) {
                        return <SmilesBlock smiles={String(children ?? "")} />;
                      }
                      return <code className="bg-gray-100 px-1 py-0.5 rounded text-xs" {...props}>{children}</code>;
                    },
                    pre: ({ children, ...props }) => {
                      const codeChild = Array.isArray(children) ? children[0] : children;
                      if (isValidElement(codeChild)) {
                        const className = (codeChild.props as { className?: string }).className || "";
                        if (/language-(smiles|smi)\b/.test(className)) {
                          return <div className="my-2">{children}</div>;
                        }
                      }
                      return <pre className="bg-gray-100 p-2 rounded my-1 overflow-x-auto" {...props}>{children}</pre>;
                    },
                    blockquote: (props) =>
                      <blockquote className="border-l-4 border-gray-300 pl-3 italic my-2 text-gray-600" {...props} />,
                  }}
                >
                  {qaResult.answer}
                </ReactMarkdown>
              </div>
            </div>

            {/* Citations section */}
            {qaResult.citations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  {t("ai.citations", "Sources")} ({qaResult.citations.length})
                </p>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {qaResult.citations.map((citation, idx) => (
                    <li 
                      key={`${citation.chunk_id}-${idx}`} 
                      className="bg-blue-50 border border-blue-200 rounded p-2 text-xs"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-600">
                          {citation.page !== null
                            ? `${t("search.page", "Page")} ${citation.page}`
                            : `${t("search.chunk", "Chunk")} ${citation.chunk_id}`}
                          {citation.section_path ? ` · ${citation.section_path}` : ""}
                          {" · "}
                          <span className="text-blue-600 font-medium">
                            {(citation.score * 100).toFixed(1)}% match
                          </span>
                        </span>
                        {citation.page !== null && onJumpToPage && (
                          <button
                            onClick={() => onJumpToPage(citation.page!)}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {t("search.goToPage", "Go")}
                          </button>
                        )}
                      </div>
                      <p className="text-gray-700 line-clamp-2 bg-white rounded p-1">
                        "{citation.quote}"
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {qaResult.insufficient_evidence && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                <p className="font-medium mb-1">
                  {t("ai.tryRefining", "Try refining your question or select a different section of the book.")}
                </p>
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
          <div className="flex items-center gap-2">
            <select
              value={summaryTemplate}
              onChange={(e) => setSummaryTemplate(e.target.value as SummaryTemplate)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
              title="Summary template"
            >
              <option value="cornell">Cornell</option>
              <option value="bullet_points">Bullet Points</option>
              <option value="sq3r">SQ3R</option>
            </select>
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
        </div>

        {summaryError && (
          <p className="text-sm text-red-600 mb-2">{summaryError}</p>
        )}

        {summary && (
          <div className="bg-white border rounded p-3">
            <p className="text-xs text-gray-400 mb-2">
              {summary.chunks_used} {t("ai.chunksUsed", "passages used")} · {summary.provider} · {summary.template}
            </p>
            {renderSummary(summary.summary_json)}
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

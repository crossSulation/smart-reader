import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { KnowledgePointDetail } from "../types/KnowledgeGraph";
import { useTranslation } from "react-i18next";
type Props = {
  kpId: number | null;
  onClose: () => void;
  onNavigateTo: (kpId: number) => void;
};

const ENTITY_LABELS: Record<string, string> = {
  concept: "Concept",
  term: "Term",
  person: "Person",
  event: "Event",
};

export default function KnowledgeDetail({ kpId, onClose, onNavigateTo }: Props) {
  const [detail, setDetail] = useState<KnowledgePointDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/points/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Failed (${res.status})`);
      }
      const data: KnowledgePointDetail = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (kpId !== null) {
      load(kpId);
    } else {
      setDetail(null);
    }
  }, [kpId, load]);

  if (kpId === null) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-gray-400 dark:text-gray-500">
        {t("knowledge.clickNode", "Click a node or list item to see details")}
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-sm text-gray-400">{t("knowledge.loading", "Loading...")}</div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-red-500">{error}</div>;
  }

  if (!detail) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-700">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("knowledge.detail", "Detail")}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {detail.label}
          </h3>
          <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {ENTITY_LABELS[detail.entity_type] || detail.entity_type}
          </span>
        </div>

        {detail.aliases.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-gray-500">{t("knowledge.aliases", "Aliases")}</div>
            <div className="flex flex-wrap gap-1">
              {detail.aliases.map((a, i) => (
                <span
                  key={i}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {detail.description && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-gray-500">{t("knowledge.detailDescription", "Description")}</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{detail.description}</p>
          </div>
        )}

        {detail.sample_chunks.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-gray-500">{t("knowledge.sourceChunks", "Source Chunks")}</div>
            {detail.sample_chunks.map((ch) => (
              <div
                key={ch.chunk_id}
                className="mb-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-600 dark:bg-gray-800"
              >
                <div className="mb-1 flex items-center justify-between font-medium text-gray-600 dark:text-gray-400">
                  <span>
                    {ch.book_title}
                    {ch.page_start != null && ` — p.${ch.page_start}`}
                  </span>
                  {ch.book_id != null && ch.page_start != null && (
                    <button
                      type="button"
                      onClick={() => navigate(`/reader/${ch.book_id}?page=${ch.page_start}`)}
                      className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60"
                    >
                      Read
                    </button>
                  )}
                </div>
                <div className="line-clamp-3 text-gray-500 dark:text-gray-400">
                  {ch.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {detail.linked_points.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-gray-500">
              {t("knowledge.linkedPoints", "Linked")} ({detail.linked_points.length})
            </div>
            <div className="space-y-1">
              {detail.linked_points.map((lp) => (
                <button
                  key={lp.id}
                  onClick={() => onNavigateTo(lp.id)}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  &rarr; {lp.label}
                  <span className="ml-1 text-xs text-gray-400">
                    ({ENTITY_LABELS[lp.entity_type] || lp.entity_type})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

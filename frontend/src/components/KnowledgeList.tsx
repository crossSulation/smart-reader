import type { KnowledgePointItem } from "../types/KnowledgeGraph";
import { useTranslation } from "react-i18next";

type Props = {
  items: KnowledgePointItem[];
  loading: boolean;
  selectedId: number | null;
  bookId: number | null;
  entityFilter: string;
  search: string;
  onSelect: (id: number) => void;
  onSearchChange: (search: string) => void;
  onEntityFilterChange: (type: string) => void;
};

const ENTITY_BADGES: Record<string, { label: string; color: string }> = {
  concept: { label: "Concept", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  term: { label: "Term", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  person: { label: "Person", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  event: { label: "Event", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

export default function KnowledgeList({
  items,
  loading,
  selectedId,
  entityFilter,
  search,
  onSelect,
  onSearchChange,
  onEntityFilterChange,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 p-3 dark:border-gray-700">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("knowledge.points", "Knowledge Points")}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {["", "concept", "term", "person", "event"].map((type) => (
            <button
              key={type}
              onClick={() => onEntityFilterChange(type)}
              className={`rounded px-2 py-0.5 text-xs transition ${
                entityFilter === type
                  ? "bg-gray-700 text-white dark:bg-gray-300 dark:text-gray-900"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {type || "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-400">{t("knowledge.loading", "Loading...")}</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">
            {t("knowledge.noResults", "No knowledge points found. Try expanding your search?")}
          </div>
        ) : (
          items.map((kp) => {
            const badge = ENTITY_BADGES[kp.entity_type] || ENTITY_BADGES.concept;
            return (
              <button
                key={kp.id}
                onClick={() => onSelect(kp.id)}
                className={`w-full border-b border-gray-100 px-3 py-2.5 text-left transition dark:border-gray-700 ${
                  selectedId === kp.id
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {kp.label}
                  </span>
                  {kp.link_count > 0 && (
                    <span className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0 text-xs text-gray-500 dark:bg-gray-600 dark:text-gray-300">
                      {kp.link_count}
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  <span className={`inline-block rounded px-1.5 py-0 text-xs ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

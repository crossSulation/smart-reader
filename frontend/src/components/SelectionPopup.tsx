import { HubOutlined } from "@mui/icons-material";
import { useState } from "react";
import type { KnowledgePointItem } from "../types/KnowledgeGraph";

type SelectionPopupProps = {
  selectedExcerpt: string;
  learningTagsInput: string;
  onLearningTagsInputChange: (value: string) => void;
  onClose: () => void;
  onExplain: (text: string) => void;
  onTranslate: (text: string, targetLang: string) => void;
  activeBookIdForAi: string | null;
  savingNote: boolean;
  knowledgePoints: KnowledgePointItem[];
  selectedKpIds: number[];
  onSelectedKpIdsChange: (ids: number[]) => void;
  onCreateNoteFromSelection: (kpIds: number[]) => void;
  learningStatus: string | null;
};

export default function SelectionPopup({
  selectedExcerpt,
  learningTagsInput,
  onLearningTagsInputChange,
  onClose,
  onExplain,
  onTranslate,
  activeBookIdForAi,
  savingNote,
  knowledgePoints,
  selectedKpIds,
  onSelectedKpIdsChange,
  onCreateNoteFromSelection,
  learningStatus,
}: SelectionPopupProps) {
  const [translateLang, setTranslateLang] = useState<string>("zh");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="w-full max-w-md rounded-lg border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Selected Text</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 max-h-32 select-none overflow-y-auto rounded border border-blue-100 bg-blue-50 p-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
          {selectedExcerpt}
        </p>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Tags (comma-separated)</label>
          <input
            type="text"
            value={learningTagsInput}
            onChange={(e) => onLearningTagsInputChange(e.target.value)}
            placeholder="topic,question,todo"
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              onExplain(selectedExcerpt);
              onClose();
            }}
            disabled={!activeBookIdForAi}
            className="w-full rounded bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            Explain
          </button>
          <button
            type="button"
            onClick={() => {
              onCreateNoteFromSelection(selectedKpIds);
            }}
            disabled={!activeBookIdForAi || savingNote}
            className="w-full rounded border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
          >
            {savingNote ? "Saving..." : "Save as note"}
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="flex rounded border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setTranslateLang("zh")}
              className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                translateLang === "zh"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => setTranslateLang("en")}
              className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                translateLang === "en"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              onTranslate(selectedExcerpt, translateLang);
              onClose();
            }}
            disabled={!activeBookIdForAi}
            className="flex-1 rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            Translate
          </button>
        </div>

        {knowledgePoints.length > 0 && (
          <div className="mb-3 rounded border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <HubOutlined sx={{ fontSize: 12 }} />
              Link to Knowledge Points
            </div>
            <div className="flex flex-wrap gap-1">
              {knowledgePoints.slice(0, 8).map((kp) => {
                const isSelected = selectedKpIds.includes(kp.id);
                return (
                  <button
                    key={kp.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onSelectedKpIdsChange(selectedKpIds.filter((id) => id !== kp.id));
                      } else {
                        onSelectedKpIdsChange([...selectedKpIds, kp.id]);
                      }
                    }}
                    className={`truncate rounded px-1.5 py-0.5 text-[10px] transition ${
                      isSelected
                        ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700"
                        : "bg-white text-gray-600 hover:bg-blue-50 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-blue-900/20"
                    }`}
                    title={kp.label}
                  >
                    {kp.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {learningStatus && (
          <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">{learningStatus}</div>
        )}
        {!activeBookIdForAi && (
          <div className="text-xs text-amber-700 dark:text-amber-400">Upload/index must complete before saving learning items.</div>
        )}
      </div>
    </div>
  );
}

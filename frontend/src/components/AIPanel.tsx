import { AutoAwesomeOutlined, HubOutlined } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BookAgentChat from "./BookAgentChat";
import SelectionPopup from "./SelectionPopup";
import RecentNotesList from "./RecentNotesList";
import type { KnowledgePointItem } from "../types/KnowledgeGraph";

export type AIPanelLearningNote = {
  id: number;
  book_id: number;
  content: string;
  page: number | null;
  tags: string[];
  knowledge_point_ids: number[];
  created_at: string;
};

type AIPanelProps = {
  fileType: "pdf" | "epub" | "markdown";
  selectedExcerpt: string;
  learningTagsInput: string;
  onLearningTagsInputChange: (value: string) => void;
  onClearSelectedExcerpt: () => void;
  onExplainSelection: (text: string) => void;
  onTranslateSelection?: (text: string, targetLang: string) => void;
  learningStatus: string | null;
  savingNote: boolean;
  savingFlashcard: boolean;
  activeBookIdForAi: string | null;
  currentPage: number;
  notesLoading: boolean;
  notesError: string | null;
  notes: AIPanelLearningNote[];
  editingNoteId: number | null;
  editingNoteContent: string;
  onEditingNoteContentChange: (value: string) => void;
  editingNoteTagsInput: string;
  onEditingNoteTagsInputChange: (value: string) => void;
  savingEditedNoteId: number | null;
  deletingNoteId: number | null;
  onStartEditNote: (note: AIPanelLearningNote) => void;
  onCancelEditNote: () => void;
  onSaveEditedNote: (noteId: number) => void;
  onDeleteNote: (noteId: number) => void;
  onJumpTarget: (target: number) => void;
  prefillReferenceTerm: string;
  knowledgePoints: KnowledgePointItem[];
  knowledgePointsLoading: boolean;
  selectedKpIds: number[];
  onSelectedKpIdsChange: (ids: number[]) => void;
  onCreateNoteFromSelectionWithKp: (kpIds: number[]) => void;
  onCreateFlashcardFromSelectionWithKp: (kpIds: number[]) => void;
  onPrefillConsumed?: () => void;
  onNoteSaved?: () => void;
  isMobile?: boolean;
};

export default function AIPanel({
  fileType,
  selectedExcerpt,
  learningTagsInput,
  onLearningTagsInputChange,
  onClearSelectedExcerpt,
  onExplainSelection,
  onTranslateSelection,
  learningStatus,
  savingNote,
  savingFlashcard,
  activeBookIdForAi,
  currentPage,
  notesLoading,
  notesError,
  notes,
  editingNoteId,
  editingNoteContent,
  onEditingNoteContentChange,
  editingNoteTagsInput,
  onEditingNoteTagsInputChange,
  savingEditedNoteId,
  deletingNoteId,
  onStartEditNote,
  onCancelEditNote,
  onSaveEditedNote,
  onDeleteNote,
  onJumpTarget,
  prefillReferenceTerm,
  knowledgePoints,
  knowledgePointsLoading,
  selectedKpIds,
  onSelectedKpIdsChange,
  onCreateNoteFromSelectionWithKp,
  onCreateFlashcardFromSelectionWithKp,
  onPrefillConsumed,
  onNoteSaved,
  isMobile = false,
}: AIPanelProps) {
  const navigate = useNavigate();
  const [showRecentNotes, setShowRecentNotes] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [selectedNoteForChat, setSelectedNoteForChat] = useState<AIPanelLearningNote | null>(null);
  const [creditStatus, setCreditStatus] = useState<"ok" | "low" | "exhausted" | null>(null);
  const [creditBalance, setCreditBalance] = useState<number>(0);

  const buildKnowledgeUrl = (kpId?: number) => {
    const params = new URLSearchParams();
    if (kpId) params.set("kp_id", String(kpId));
    if (activeBookIdForAi) params.set("book_id", activeBookIdForAi);
    if (currentPage > 0) params.set("page", String(currentPage));
    return "/knowledge?" + params.toString();
  };

  useEffect(() => {
    setShowRecentNotes(false);
    setShowKnowledge(false);
    setSelectedNoteForChat(null);
  }, [activeBookIdForAi]);

  useEffect(() => {
    const checkCredits = async () => {
      try {
        const res = await fetch("/api/billing/stats", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCreditBalance(data.balance || 0);
          const headerStatus = res.headers.get("X-Credit-Status");
          setCreditStatus((headerStatus as "ok" | "low" | "exhausted") || "ok");
        }
      } catch { /* ignore */ }
    };
    checkCredits();
    const interval = setInterval(checkCredits, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <AutoAwesomeOutlined fontSize="small" />
          <span>AI Panel</span>
        </div>
      </div>

      {creditStatus === "exhausted" && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          Credits exhausted. Cloud AI features are disabled.{" "}
          <a href="/billing" className="underline">Purchase credits</a> or switch to local mode.
        </div>
      )}
      {creditStatus === "low" && creditBalance > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          Credits running low ({creditBalance.toLocaleString()} remaining).{" "}
          <a href="/billing" className="underline">Purchase more</a> to continue using cloud AI.
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {selectedExcerpt && (
          <SelectionPopup
            selectedExcerpt={selectedExcerpt}
            learningTagsInput={learningTagsInput}
            onLearningTagsInputChange={onLearningTagsInputChange}
            onClose={onClearSelectedExcerpt}
            onExplain={onExplainSelection}
            onTranslate={onTranslateSelection || (() => {})}
            activeBookIdForAi={activeBookIdForAi}
            savingNote={savingNote}
            savingFlashcard={savingFlashcard}
            knowledgePoints={knowledgePoints}
            selectedKpIds={selectedKpIds}
            onSelectedKpIdsChange={onSelectedKpIdsChange}
            onCreateNoteFromSelection={onCreateNoteFromSelectionWithKp}
            onCreateFlashcardFromSelection={onCreateFlashcardFromSelectionWithKp}
            learningStatus={learningStatus}
          />
        )}

        {!activeBookIdForAi ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Local file is open. AI search/QA will be available after background upload finishes.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex gap-1 rounded border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => { setShowRecentNotes(false); setShowKnowledge(false); }}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  !showRecentNotes && !showKnowledge
                    ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => { setShowRecentNotes(true); setShowKnowledge(false); }}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  showRecentNotes
                    ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Recent Notes
              </button>
              {!isMobile && (
              <button
                type="button"
                onClick={() => { setShowKnowledge(true); setShowRecentNotes(false); }}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  showKnowledge
                    ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <HubOutlined sx={{ fontSize: 14 }} className="mr-1" />
                Knowledge
              </button>
              )}
            </div>

            {!showRecentNotes && !showKnowledge ? (
              <div className="min-h-0 flex-1">
                <BookAgentChat
                  bookId={activeBookIdForAi}
                  selectedExcerpt={selectedExcerpt}
                  seedPrompt={prefillReferenceTerm}
                  onJumpToPage={onJumpTarget}
                  fileType={fileType}
                  onRequestShowNotes={() => { setShowRecentNotes(true); setShowKnowledge(false); }}
                  onSeedConsumed={onPrefillConsumed}
                  currentPage={currentPage}
                  onNoteSaved={onNoteSaved}
                  selectedNote={selectedNoteForChat}
                />
              </div>
            ) : showKnowledge ? (
              <div className="min-h-0 flex-1 overflow-y-auto rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Related Knowledge Points
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(buildKnowledgeUrl())}
                    className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                  >
                    Open Graph &rarr;
                  </button>
                </div>
                {knowledgePointsLoading ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Loading knowledge points...</div>
                ) : knowledgePoints.length === 0 ? (
                  <div className="rounded border border-dashed border-gray-300 p-3 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    <HubOutlined sx={{ fontSize: 24 }} className="mb-1 text-gray-300 dark:text-gray-600" />
                    <div>No knowledge points extracted yet for this book.</div>
                    <div className="mt-1">Index the book to auto-extract concepts.</div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {knowledgePoints.map((kp) => (
                      <button
                        key={kp.id}
                        type="button"
                        onClick={() => navigate(buildKnowledgeUrl(kp.id))}
                        className="flex w-full items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2.5 py-2 text-left transition hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-blue-900/20"
                      >
                        <HubOutlined sx={{ fontSize: 14 }} className="shrink-0 text-blue-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{kp.label}</div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="rounded bg-gray-200 px-1 py-0.5 dark:bg-gray-700">{kp.entity_type}</span>
                            {kp.link_count > 0 && <span>{kp.link_count} links</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <RecentNotesList
                notes={notes}
                notesLoading={notesLoading}
                notesError={notesError}
                editingNoteId={editingNoteId}
                editingNoteContent={editingNoteContent}
                onEditingNoteContentChange={onEditingNoteContentChange}
                editingNoteTagsInput={editingNoteTagsInput}
                onEditingNoteTagsInputChange={onEditingNoteTagsInputChange}
                savingEditedNoteId={savingEditedNoteId}
                deletingNoteId={deletingNoteId}
                onStartEditNote={onStartEditNote}
                onCancelEditNote={onCancelEditNote}
                onSaveEditedNote={onSaveEditedNote}
                onDeleteNote={onDeleteNote}
                onNoteClick={(note) => {
                  setSelectedNoteForChat(note);
                  if (typeof note.page === "number") {
                    onJumpTarget(note.page);
                  }
                }}
                knowledgePoints={knowledgePoints}
                onKnowledgePointClick={(kpId) => navigate(buildKnowledgeUrl(kpId))}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
import { AutoAwesomeOutlined, HubOutlined } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BookAgentChat from "./BookAgentChat";
import SelectionPopup from "./SelectionPopup";
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
  isMobile?: boolean;
};

const parseTagsInput = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

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
  isMobile = false,
}: AIPanelProps) {
  const navigate = useNavigate();
  const [showRecentNotes, setShowRecentNotes] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [selectedNoteForChat, setSelectedNoteForChat] = useState<AIPanelLearningNote | null>(null);

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

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <AutoAwesomeOutlined fontSize="small" />
          <span>AI Panel</span>
        </div>
      </div>

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
              <div className="min-h-0 flex-1 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Recent Notes</div>
                {notesLoading ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Loading notes...</div>
                ) : notesError ? (
                  <div className="text-xs text-red-600 dark:text-red-400">{notesError}</div>
                ) : notes.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No notes yet for this book.</div>
                ) : (
                  <ul className="max-h-full space-y-2 overflow-y-auto">
                    {notes.map((note) => (
                      <li key={note.id} className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
                        {editingNoteId === note.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingNoteContent}
                              onChange={(e) => onEditingNoteContentChange(e.target.value)}
                              rows={3}
                              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                            />
                            <input
                              type="text"
                              value={editingNoteTagsInput}
                              onChange={(e) => onEditingNoteTagsInputChange(e.target.value)}
                              placeholder="tags: topic,important"
                              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500"
                            />
                            {parseTagsInput(editingNoteTagsInput).length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                {parseTagsInput(editingNoteTagsInput).map((tag) => (
                                  <span
                                    key={`edit-${note.id}-${tag}`}
                                    className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={onCancelEditNote}
                                disabled={savingEditedNoteId === note.id}
                                className="rounded px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => onSaveEditedNote(note.id)}
                                disabled={savingEditedNoteId === note.id}
                                className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                              >
                                {savingEditedNoteId === note.id ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNoteForChat(note);
                              setShowRecentNotes(false);
                              if (typeof note.page === "number") {
                                onJumpTarget(note.page);
                              }
                            }}
                            disabled={typeof note.page !== "number"}
                            className="w-full text-left"
                            title={typeof note.page === "number" ? `Jump to page ${note.page}` : "No page linked"}
                          >
                            <p className="line-clamp-2 text-xs text-gray-800 dark:text-gray-200">{note.content}</p>
                          </button>
                        )}
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                          <div className="flex flex-wrap items-center gap-2">
                            {note.page ? <span>Page {note.page}</span> : null}
                            {note.tags.slice(0, 3).map((tag) => (
                              <span key={`${note.id}-${tag}`} className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">#{tag}</span>
                            ))}
                            {note.knowledge_point_ids?.map((kpId) => {
                              const kp = knowledgePoints.find((k) => k.id === kpId);
                              if (!kp) return null;
                              return (
                                <span
                                  key={`${note.id}-kp-${kpId}`}
                                  className="flex cursor-pointer items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(buildKnowledgeUrl(kpId));
                                  }}
                                  title={`Knowledge: ${kp.label}`}
                                >
                                  <HubOutlined sx={{ fontSize: 10 }} />
                                  {kp.label.length > 12 ? kp.label.slice(0, 12) + "…" : kp.label}
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onStartEditNote(note)}
                              disabled={deletingNoteId === note.id || savingEditedNoteId === note.id}
                              className="rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-900/30"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteNote(note.id)}
                              disabled={deletingNoteId === note.id || savingEditedNoteId === note.id}
                              className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              {deletingNoteId === note.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
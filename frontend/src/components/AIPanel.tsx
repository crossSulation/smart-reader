import { AutoAwesomeOutlined } from "@mui/icons-material";
import { useEffect, useState } from "react";
import BookAgentChat from "./BookAgentChat";

export type AIPanelLearningNote = {
  id: number;
  book_id: number;
  content: string;
  page: number | null;
  tags: string[];
  created_at: string;
};

type AIPanelProps = {
  fileType: "pdf" | "epub" | "markdown";
  selectedExcerpt: string;
  learningTagsInput: string;
  onLearningTagsInputChange: (value: string) => void;
  onCreateNoteFromSelection: () => void;
  onCreateFlashcardFromSelection: () => void;
  onClearSelectedExcerpt: () => void;
  onExplainSelection: (text: string) => void;
  learningStatus: string | null;
  savingNote: boolean;
  savingFlashcard: boolean;
  activeBookIdForAi: string | null;
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
  onCreateNoteFromSelection,
  onCreateFlashcardFromSelection,
  onClearSelectedExcerpt,
  onExplainSelection,
  learningStatus,
  savingNote,
  savingFlashcard,
  activeBookIdForAi,
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
}: AIPanelProps) {
  const [showRecentNotes, setShowRecentNotes] = useState(false);
  const [selectedNoteForChat, setSelectedNoteForChat] = useState<AIPanelLearningNote | null>(null);

  useEffect(() => {
    setShowRecentNotes(false);
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
              className="w-full max-w-md rounded-lg border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-800 dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Selected Text</h3>
                <button
                  type="button"
                  onClick={onClearSelectedExcerpt}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <p className="mb-4 max-h-32 overflow-y-auto rounded border border-blue-100 bg-blue-50 p-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
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
                    onExplainSelection(selectedExcerpt);
                    onClearSelectedExcerpt();
                  }}
                  disabled={!activeBookIdForAi}
                  className="w-full rounded bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-purple-500 dark:hover:bg-purple-600"
                >
                  Explain
                </button>
                <button
                  type="button"
                  onClick={onCreateNoteFromSelection}
                  disabled={!activeBookIdForAi || savingNote || savingFlashcard}
                  className="flex-1 rounded border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  {savingNote ? "Saving..." : "Save as note"}
                </button>
                <button
                  type="button"
                  onClick={onCreateFlashcardFromSelection}
                  disabled={!activeBookIdForAi || savingNote || savingFlashcard}
                  className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {savingFlashcard ? "Creating..." : "Create card"}
                </button>
              </div>

              {learningStatus && (
                <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">{learningStatus}</div>
              )}
              {!activeBookIdForAi && (
                <div className="text-xs text-amber-700 dark:text-amber-400">Upload/index must complete before saving learning items.</div>
              )}
            </div>
          </div>
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
                onClick={() => setShowRecentNotes(false)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  !showRecentNotes
                    ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setShowRecentNotes(true)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  showRecentNotes
                    ? "bg-white text-blue-700 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Recent Notes
              </button>
            </div>

            {!showRecentNotes ? (
              <div className="min-h-0 flex-1">
                <BookAgentChat
                  bookId={activeBookIdForAi}
                  selectedExcerpt={selectedExcerpt}
                  seedPrompt={prefillReferenceTerm}
                  onJumpToPage={onJumpTarget}
                  fileType={fileType}
                  onRequestShowNotes={() => setShowRecentNotes(true)}
                  selectedNote={selectedNoteForChat}
                />
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
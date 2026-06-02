import { AutoAwesomeOutlined } from "@mui/icons-material";
import BookSearch from "./BookSearch";
import BookQA from "./BookQA";

export type AIPanelLearningNote = {
  id: number;
  book_id: number;
  content: string;
  page: number | null;
  tags: string[];
  created_at: string;
};

type AIPanelProps = {
  aiTab: "search" | "ai";
  onAiTabChange: (tab: "search" | "ai") => void;
  selectedExcerpt: string;
  learningTagsInput: string;
  onLearningTagsInputChange: (value: string) => void;
  onCreateNoteFromSelection: () => void;
  onCreateFlashcardFromSelection: () => void;
  onClearSelectedExcerpt: () => void;
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
  isIndexing?: boolean;
};

const parseTagsInput = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export default function AIPanel({
  aiTab,
  onAiTabChange,
  selectedExcerpt,
  learningTagsInput,
  onLearningTagsInputChange,
  onCreateNoteFromSelection,
  onCreateFlashcardFromSelection,
  onClearSelectedExcerpt,
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
  isIndexing,
}: AIPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <AutoAwesomeOutlined fontSize="small" />
          <span>AI Panel</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 bg-gray-50 px-3 pt-3">
        {(["search", "ai"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onAiTabChange(tab)}
            className={`rounded-t px-4 py-2 text-sm font-medium transition ${
              aiTab === tab
                ? "-mb-px border border-b-white border-gray-200 bg-white text-blue-700"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab === "search" ? "Search" : "AI Assistant"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selectedExcerpt && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Selected Text</div>
            <p className="mb-3 line-clamp-3 text-sm text-blue-900">{selectedExcerpt}</p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-blue-800">Tags (comma-separated)</label>
              <input
                type="text"
                value={learningTagsInput}
                onChange={(e) => onLearningTagsInputChange(e.target.value)}
                placeholder="topic,question,todo"
                className="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs text-blue-900 placeholder:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onCreateNoteFromSelection}
                disabled={!activeBookIdForAi || savingNote || savingFlashcard}
                className="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingNote ? "Saving..." : "Save as note"}
              </button>
              <button
                type="button"
                onClick={onCreateFlashcardFromSelection}
                disabled={!activeBookIdForAi || savingNote || savingFlashcard}
                className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingFlashcard ? "Creating..." : "Create flashcard"}
              </button>
              <button
                type="button"
                onClick={onClearSelectedExcerpt}
                className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white"
              >
                Clear
              </button>
            </div>
            {learningStatus && (
              <div className="mt-2 text-xs text-gray-700">{learningStatus}</div>
            )}
            {!activeBookIdForAi && (
              <div className="mt-2 text-xs text-amber-700">Upload/index must complete before saving learning items.</div>
            )}
          </div>
        )}

        <div className="mb-4 rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Recent Notes</div>
          {notesLoading ? (
            <div className="text-xs text-gray-500">Loading notes...</div>
          ) : notesError ? (
            <div className="text-xs text-red-600">{notesError}</div>
          ) : notes.length === 0 ? (
            <div className="text-xs text-gray-500">No notes yet for this book.</div>
          ) : (
            <ul className="max-h-44 space-y-2 overflow-y-auto">
              {notes.map((note) => (
                <li key={note.id} className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingNoteContent}
                        onChange={(e) => onEditingNoteContentChange(e.target.value)}
                        rows={3}
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                      <input
                        type="text"
                        value={editingNoteTagsInput}
                        onChange={(e) => onEditingNoteTagsInputChange(e.target.value)}
                        placeholder="tags: topic,important"
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                      {parseTagsInput(editingNoteTagsInput).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {parseTagsInput(editingNoteTagsInput).map((tag) => (
                            <span
                              key={`edit-${note.id}-${tag}`}
                              className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700"
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
                          className="rounded px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => onSaveEditedNote(note.id)}
                          disabled={savingEditedNoteId === note.id}
                          className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingEditedNoteId === note.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof note.page === "number") {
                          onJumpTarget(note.page);
                        }
                      }}
                      disabled={typeof note.page !== "number"}
                      className="w-full text-left"
                      title={typeof note.page === "number" ? `Jump to page ${note.page}` : "No page linked"}
                    >
                      <p className="line-clamp-2 text-xs text-gray-800">{note.content}</p>
                    </button>
                  )}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
                    <div className="flex flex-wrap items-center gap-2">
                      {note.page ? <span>Page {note.page}</span> : null}
                      {note.tags.slice(0, 3).map((tag) => (
                        <span key={`${note.id}-${tag}`} className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">#{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onStartEditNote(note)}
                        disabled={deletingNoteId === note.id || savingEditedNoteId === note.id}
                        className="rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        disabled={deletingNoteId === note.id || savingEditedNoteId === note.id}
                        className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-60"
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

        {!activeBookIdForAi ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Local file is open. AI search/QA will be available after background upload finishes.
          </div>
        ) : aiTab === "search" ? (
          <BookSearch bookId={activeBookIdForAi} onJumpToPage={onJumpTarget} isIndexing={isIndexing} />
        ) : (
          <BookQA
            bookId={activeBookIdForAi}
            onJumpToPage={onJumpTarget}
            prefillReferenceTerm={prefillReferenceTerm}
          />
        )}
      </div>
    </>
  );
}
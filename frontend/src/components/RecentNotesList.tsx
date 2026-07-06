import { useState } from "react";
import { HubOutlined } from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { KnowledgePointItem } from "../types/KnowledgeGraph";

export type RecentNoteItem = {
  id: number;
  book_id: number;
  content: string;
  page: number | null;
  tags: string[];
  knowledge_point_ids: number[];
  created_at: string;
};

type Props = {
  notes: RecentNoteItem[];
  notesLoading: boolean;
  notesError: string | null;
  editingNoteId: number | null;
  editingNoteContent: string;
  onEditingNoteContentChange: (value: string) => void;
  editingNoteTagsInput: string;
  onEditingNoteTagsInputChange: (value: string) => void;
  savingEditedNoteId: number | null;
  deletingNoteId: number | null;
  onStartEditNote: (note: RecentNoteItem) => void;
  onCancelEditNote: () => void;
  onSaveEditedNote: (noteId: number) => void;
  onDeleteNote: (noteId: number) => void;
  onNoteClick: (note: RecentNoteItem) => void;
  knowledgePoints: KnowledgePointItem[];
  onKnowledgePointClick: (kpId: number) => void;
};

const parseTagsInput = (raw: string): string[] =>
  raw.split(",").map((tag) => tag.trim()).filter(Boolean);

export default function RecentNotesList({
  notes,
  notesLoading,
  notesError,
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
  onNoteClick,
  knowledgePoints,
  onKnowledgePointClick,
}: Props) {
  const [popupNote, setPopupNote] = useState<RecentNoteItem | null>(null);

  return (
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
                        <span key={`edit-${note.id}-${tag}`} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">#{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={onCancelEditNote} disabled={savingEditedNoteId === note.id} className="rounded px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700">Cancel</button>
                    <button type="button" onClick={() => onSaveEditedNote(note.id)} disabled={savingEditedNoteId === note.id} className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600">{savingEditedNoteId === note.id ? "Saving..." : "Save"}</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => onNoteClick(note)} onDoubleClick={() => setPopupNote(note)} className="w-full text-left">
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
                        onClick={(e) => { e.stopPropagation(); onKnowledgePointClick(kpId); }}
                        title={`Knowledge: ${kp.label}`}
                      >
                        <HubOutlined sx={{ fontSize: 10 }} />
                        {kp.label.length > 12 ? kp.label.slice(0, 12) + "\u2026" : kp.label}
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => onStartEditNote(note)} disabled={deletingNoteId === note.id || savingEditedNoteId === note.id} className="rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-900/30">Edit</button>
                  <button type="button" onClick={() => onDeleteNote(note.id)} disabled={deletingNoteId === note.id || savingEditedNoteId === note.id} className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-900/30">{deletingNoteId === note.id ? "Deleting..." : "Delete"}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {popupNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPopupNote(null)}>
          <div
            className="select-none max-h-[70vh] w-[680px] max-w-[90vw] overflow-y-auto rounded-lg border bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Note</h3>
              <button type="button" onClick={() => setPopupNote(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{popupNote.content}</ReactMarkdown>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {popupNote.page && <span>Page {popupNote.page}</span>}
              {popupNote.tags.map((tag) => (
                <span key={tag} className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">#{tag}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

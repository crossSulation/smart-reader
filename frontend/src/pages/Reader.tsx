import { useCallback, useEffect, useRef, useState, useMemo, type ChangeEvent } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowBack, AutoAwesomeOutlined, LocalOfferOutlined, SettingsOutlined, UploadFileOutlined, ViewSidebarOutlined } from "@mui/icons-material";
import {
  Dialog, DialogTitle, DialogContent, Slider, FormControl,
  InputLabel, Select, MenuItem, Switch, FormControlLabel, IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { Document, Page, pdfjs } from "react-pdf";
import { invoke } from "@tauri-apps/api/core";
import MarkdownViewer, { type MarkdownSidebarEntry, type MarkdownViewerHandle } from "../components/MarkdownViewer";
import PDFViewer from "../components/PDFViewer";
import EPUBViewer, { type EPUBViewerHandle } from "../components/EPUBViewer";
import AIPanel, { type AIPanelLearningNote } from "../components/AIPanel";
import BareTitleBar from "../components/BareTitleBar";
import { useKeyboardShortcuts, type ShortcutBinding } from "../hooks/useKeyboardShortcuts";
import { useThemeContext } from "../contexts/ThemeContext";
import type { Book } from "../types/Book";
import type { KnowledgePointItem } from "../types/KnowledgeGraph";

type LearningNote = AIPanelLearningNote;

const parseTagsInput = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpToPage, setJumpToPage] = useState<number | undefined>(undefined);
  const [leftPanelTab, setLeftPanelTab] = useState<"navigation" | "tags">("navigation");
  const [prefillReferenceTerm, setPrefillReferenceTerm] = useState("");
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const [learningTagsInput, setLearningTagsInput] = useState("highlight");
  const [learningStatus, setLearningStatus] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [savingFlashcard, setSavingFlashcard] = useState(false);
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [editingNoteTagsInput, setEditingNoteTagsInput] = useState("");
  const [savingEditedNoteId, setSavingEditedNoteId] = useState<number | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePointItem[]>([]);
  const [knowledgePointsLoading, setKnowledgePointsLoading] = useState(false);
  const [selectedKpIds, setSelectedKpIds] = useState<number[]>([]);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [epubProgress, setEpubProgress] = useState(0);
  const [currentPageDisplay, setCurrentPageDisplay] = useState<string | number>("?");
  const [totalPageDisplay, setTotalPageDisplay] = useState<string | number>("?");
  const [progressPercent, setProgressPercent] = useState(0);
  const [markdownJumpSection, setMarkdownJumpSection] = useState<number | undefined>(undefined);
  const [markdownSidebarEntries, setMarkdownSidebarEntries] = useState<MarkdownSidebarEntry[]>([]);
  const [activeMarkdownSectionIndex, setActiveMarkdownSectionIndex] = useState(0);
  const [localFile, setLocalFile] = useState<{ name: string; type: "pdf" | "epub" | "markdown"; url: string } | null>(null);
  const [localUploadStatus, setLocalUploadStatus] = useState<"idle" | "uploading" | "uploaded" | "failed">("idle");
  const [localUploadMessage, setLocalUploadMessage] = useState("");
  const [uploadedBookId, setUploadedBookId] = useState<number | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [isTauri, setIsTauri] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const saved = localStorage.getItem("ai-panel-width");
    return saved ? Number(saved) : 480;
  });
  const aiPanelDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const markdownViewerRef = useRef<MarkdownViewerHandle | null>(null);
  const epubViewerRef = useRef<EPUBViewerHandle | null>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const previousLocalUrlRef = useRef<string | null>(null);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  const handleTextSelected = useCallback((text: string) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean) return;
    setSelectedExcerpt(clean.slice(0, 400));
  }, []);

  const createNoteFromSelection = async (kpIds: number[] = []) => {
    if (!selectedExcerpt.trim() || !activeBookIdForAi) return;

    setSavingNote(true);
    setLearningStatus(null);
    try {
      const tags = learningTagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        book_id: Number(activeBookIdForAi),
        content: selectedExcerpt,
        source_text: selectedExcerpt,
        page: activeFileType === "pdf" ? currentPdfPage : null,
        tags,
      };
      if (kpIds.length > 0) {
        body.knowledge_point_ids = kpIds;
      }

      const res = await fetch("/api/learning/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Create note failed (${res.status})`);
      }

      setLearningStatus("Saved as note.");
      setSelectedKpIds([]);
      if (activeBookIdForAi) {
        const refreshRes = await fetch(`/api/learning/notes?book_id=${encodeURIComponent(activeBookIdForAi)}&limit=20`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (refreshRes.ok) {
          const notesData: LearningNote[] = await refreshRes.json();
          setNotes(Array.isArray(notesData) ? notesData : []);
        }
      }
    } catch (err) {
      setLearningStatus(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  const reloadNotes = async (bookIdValue: string) => {
    const res = await fetch(`/api/learning/notes?book_id=${encodeURIComponent(bookIdValue)}&limit=20`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `Load notes failed (${res.status})`);
    }
    const data: LearningNote[] = await res.json();
    setNotes(Array.isArray(data) ? data : []);
  };

  const handleDeleteNote = async (noteId: number) => {
    setDeletingNoteId(noteId);
    setNotesError(null);
    try {
      const res = await fetch(`/api/learning/notes/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Delete note failed (${res.status})`);
      }

      if (activeBookIdForAi) {
        await reloadNotes(activeBookIdForAi);
      }
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "Failed to delete note.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  const startEditNote = (note: LearningNote) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
    setEditingNoteTagsInput(note.tags.join(","));
    setNotesError(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent("");
    setEditingNoteTagsInput("");
  };

  const saveEditedNote = async (noteId: number) => {
    const content = editingNoteContent.trim();
    const tags = parseTagsInput(editingNoteTagsInput);
    if (!content) {
      setNotesError("Note content cannot be empty.");
      return;
    }

    setSavingEditedNoteId(noteId);
    setNotesError(null);
    try {
      const res = await fetch(`/api/learning/notes/${noteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ content, tags }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Update note failed (${res.status})`);
      }

      if (activeBookIdForAi) {
        await reloadNotes(activeBookIdForAi);
      }
      cancelEditNote();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "Failed to update note.");
    } finally {
      setSavingEditedNoteId(null);
    }
  };

  const createFlashcardFromSelection = async (kpIds: number[] = []) => {
    if (!selectedExcerpt.trim() || !activeBookIdForAi) return;

    setSavingFlashcard(true);
    setLearningStatus(null);
    try {
      const tags = learningTagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        book_id: Number(activeBookIdForAi),
        front: selectedExcerpt,
        back: "",
        source_text: selectedExcerpt,
        tags,
      };
      if (kpIds.length > 0) {
        body.knowledge_point_ids = kpIds;
      }

      const res = await fetch("/api/learning/flashcards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Create flashcard failed (${res.status})`);
      }

      setLearningStatus("Created flashcard. Review it on the Review page.");
      setSelectedKpIds([]);
    } catch (err) {
      setLearningStatus(err instanceof Error ? err.message : "Failed to create flashcard.");
    } finally {
      setSavingFlashcard(false);
    }
  };

  useEffect(() => {
    if (!id) {
      setError("Book ID not found");
      setLoading(false);
      return;
    }

    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/books/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to load book: ${res.status}`);
        }

        const data = await res.json();
        setBook(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  useEffect(() => {
    const previous = previousLocalUrlRef.current;
    if (previous && previous !== localFile?.url) {
      URL.revokeObjectURL(previous);
    }
    previousLocalUrlRef.current = localFile?.url ?? null;
  }, [localFile?.url]);

  useEffect(() => {
    return () => {
      if (previousLocalUrlRef.current) {
        URL.revokeObjectURL(previousLocalUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    invoke<boolean>("is_desktop").then(setIsTauri).catch(() => {});
  }, []);

  useEffect(() => {
    if (!uploadedBookId) return;

    const triggerAutoIndex = async () => {
      setIndexing(true);
      try {
        const res = await fetch(`/api/books/${uploadedBookId}/index`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Indexing failed (${res.status})`);
        }
        setLocalUploadMessage("Book indexed and ready for search/AI.");
      } catch {
        setLocalUploadMessage("Indexing failed. You can retry manually.");
      } finally {
        setIndexing(false);
      }
    };

    triggerAutoIndex();
  }, [uploadedBookId]);

  const detectLocalFileType = (fileName: string): "pdf" | "epub" | "markdown" | null => {
    const lowered = fileName.toLowerCase();
    if (lowered.endsWith(".pdf")) return "pdf";
    if (lowered.endsWith(".epub")) return "epub";
    if (lowered.endsWith(".md") || lowered.endsWith(".markdown")) return "markdown";
    return null;
  };

  const handlePickLocalFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;

    const detectedType = detectLocalFileType(picked.name);
    if (!detectedType) {
      setLocalUploadStatus("failed");
      setLocalUploadMessage("Unsupported file type. Please select PDF, EPUB, or Markdown.");
      e.target.value = "";
      return;
    }

    const localUrl = URL.createObjectURL(picked);
    setLocalFile({
      name: picked.name,
      type: detectedType,
      url: localUrl,
    });
    setUploadedBookId(null);
    setJumpToPage(undefined);
    setMarkdownJumpSection(undefined);
    setCurrentPdfPage(1);
    setPdfTotalPages(0);
    setLocalUploadStatus("uploading");
    setLocalUploadMessage("Uploading in background...");

    try {
      const formData = new FormData();
      formData.append("file", picked);

      const res = await fetch("/api/upload/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setUploadedBookId(typeof data.book_id === "number" ? data.book_id : null);
      setLocalUploadStatus("uploaded");
      setLocalUploadMessage("Background upload completed.");
    } catch (err) {
      setLocalUploadStatus("failed");
      setLocalUploadMessage(err instanceof Error ? err.message : "Background upload failed.");
    } finally {
      e.target.value = "";
    }
  };

  const resolveBookFileType = (currentBook: Book | null): "pdf" | "epub" | "markdown" => {
    const rawFileType = (currentBook?.file_type || "").toLowerCase();
    const title = (currentBook?.title || "").toLowerCase();

    if (rawFileType.includes("markdown") || rawFileType === "md") return "markdown";
    if (rawFileType.includes("epub")) return "epub";
    if (rawFileType.includes("pdf")) return "pdf";

    if (title.endsWith(".md") || title.endsWith(".markdown")) return "markdown";
    if (title.endsWith(".epub")) return "epub";
    return "pdf";
  };

  const normalizedFileType = resolveBookFileType(book);
  const activeFileType = localFile?.type ?? normalizedFileType;
  const activeTitle = localFile?.name ?? book?.title ?? "Untitled";

  const activeBookIdForAi = localFile
    ? (uploadedBookId ? String(uploadedBookId) : null)
    : (id ?? null);

  // Sync page display state from file-type-specific sources
  useEffect(() => {
    if (activeFileType === "pdf") {
      setCurrentPageDisplay(currentPdfPage);
      setTotalPageDisplay(pdfTotalPages || (!localFile ? book?.total_pages : undefined) || "?");
      setProgressPercent(pdfTotalPages ? Math.min(100, Math.max(0, (currentPdfPage / pdfTotalPages) * 100)) : 0);
    } else if (activeFileType === "epub") {
      setCurrentPageDisplay(`${epubProgress}%`);
      setTotalPageDisplay("100%");
      setProgressPercent(epubProgress);
    } else {
      const cp = Math.max(1, book?.current_page ?? 1);
      const tp = (!localFile ? book?.total_pages : undefined) || "?";
      setCurrentPageDisplay(cp);
      setTotalPageDisplay(tp);
      if (typeof tp === "number") {
        setProgressPercent(Math.min(100, Math.max(0, (cp / tp) * 100)));
      } else {
        setProgressPercent(0);
      }
    }
  }, [activeFileType, currentPdfPage, pdfTotalPages, epubProgress, book?.current_page, book?.total_pages, localFile]);

  const thumbnailFile = useMemo(() => {
    if (localFile && activeFileType === "pdf") return localFile.url;
    if (book?.file_url) {
      return {
        url: book.file_url,
        httpHeaders: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      };
    }
    return null;
  }, [localFile?.url, activeFileType, book?.file_url]);

  const thumbnails = useMemo(() => {
    if (!thumbnailFile || pdfTotalPages <= 0) return null;
    return (
      <Document file={thumbnailFile} loading="">
        {Array.from({ length: pdfTotalPages }, (_, i) => i + 1).map((page) => (
          <div
            key={page}
            ref={(el) => { thumbnailRefs.current[page - 1] = el; }}
            data-page={page}
            onClick={() => setJumpToPage(page)}
            className="m-1 cursor-pointer rounded border-2 border-transparent transition-colors hover:border-blue-300"
          >
            <Page
              pageNumber={page}
              width={88}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            <div className="py-0.5 text-center text-xs text-gray-500">{page}</div>
          </div>
        ))}
      </Document>
    );
  }, [thumbnailFile, pdfTotalPages]);

  useEffect(() => {
    if (activeFileType !== "pdf") return;
    const current = thumbnailRefs.current[currentPdfPage - 1];
    if (!current) return;
    current.parentElement?.querySelectorAll("[data-page]").forEach((el) => {
      el.classList.remove("border-blue-500", "bg-blue-50");
      el.classList.add("border-transparent");
    });
    current.classList.remove("border-transparent");
    current.classList.add("border-blue-500", "bg-blue-50");
    current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPdfPage, activeFileType]);

  const onOpenSetting = () => {
    setSettingsOpen(true);
  };

  const onExplainSelection = (text: string) => {
    setPrefillReferenceTerm(`Explain the following text: ${text}`);
  };

  const handleTranslateSelection = (text: string, targetLang: string) => {
    const langName = targetLang === "zh" ? "Simplified Chinese" : "English";
    setPrefillReferenceTerm(`Translate the following text to ${langName}: ${text}`);
  };

  const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    aiPanelDragRef.current = { startX: e.clientX, startWidth: aiPanelWidth };
  }, [aiPanelWidth]);

  const handlePanelDragMove = useCallback((e: MouseEvent) => {
    if (!aiPanelDragRef.current) return;
    const delta = aiPanelDragRef.current.startX - e.clientX;
    const newWidth = Math.max(280, Math.min(window.innerWidth * 0.6, aiPanelDragRef.current.startWidth + delta));
    setAiPanelWidth(newWidth);
  }, []);

  const handlePanelDragEnd = useCallback(() => {
    aiPanelDragRef.current = null;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => handlePanelDragMove(e);
    const onUp = () => handlePanelDragEnd();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [handlePanelDragMove, handlePanelDragEnd]);

  useEffect(() => {
    localStorage.setItem("ai-panel-width", String(aiPanelWidth));
  }, [aiPanelWidth]);

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    } else {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    }
  };

  const { toggleColorMode } = useThemeContext();

  const shortcutBindings: ShortcutBinding[] = [
    {
      key: 'ArrowRight',
      handler: () => {
        if (activeFileType === 'pdf') setJumpToPage(currentPdfPage + 1);
        else if (activeFileType === 'epub') epubViewerRef.current?.next();
      },
    },
    {
      key: 'j',
      handler: () => {
        if (activeFileType === 'pdf') setJumpToPage(currentPdfPage + 1);
        else if (activeFileType === 'epub') epubViewerRef.current?.next();
      },
    },
    {
      key: 'ArrowLeft',
      handler: () => {
        if (activeFileType === 'pdf') setJumpToPage(currentPdfPage - 1);
        else if (activeFileType === 'epub') epubViewerRef.current?.prev();
      },
    },
    {
      key: 'k',
      handler: () => {
        if (activeFileType === 'pdf') setJumpToPage(currentPdfPage - 1);
        else if (activeFileType === 'epub') epubViewerRef.current?.prev();
      },
    },
    {
      key: 'f',
      ctrl: true,
      shift: true,
      handler: handleToggleFullscreen,
    },
    {
      key: 'F11',
      handler: handleToggleFullscreen,
    },
    {
      key: 'KeyD',
      ctrl: true,
      shift: true,
      handler: toggleColorMode,
    },
    {
      key: 'Slash',
      handler: () => {
        setPrefillReferenceTerm(selectedExcerpt || '');
      },
    },
    {
      key: 'b',
      ctrl: true,
      handler: () => {
        if (selectedExcerpt) {
          setPrefillReferenceTerm(selectedExcerpt);
        }
      },
    },
  ];

  useKeyboardShortcuts(shortcutBindings);

  const readerContentStyle = {
    fontSize: `${fontSize}px`,
    fontFamily,
  };
  useEffect(() => {
    if (activeFileType !== "pdf") {
      setCurrentPdfPage(1);
      setPdfTotalPages(0);
      return;
    }

    const initialPage = localFile ? 1 : Math.max(1, book?.current_page ?? 1);
    setCurrentPdfPage(initialPage);
  }, [book, activeFileType, localFile]);

  useEffect(() => {
    if (activeFileType !== "markdown") {
      setMarkdownSidebarEntries([]);
      setActiveMarkdownSectionIndex(0);
    }
  }, [activeFileType]);

  const handleJumpTarget = (target: number) => {
    if (activeFileType === "markdown") {
      setMarkdownJumpSection(target);
      return;
    }
    setJumpToPage(target);
  };

  useEffect(() => {
    if (!activeBookIdForAi) {
      setNotes([]);
      setNotesError(null);
      return;
    }

    const fetchNotes = async () => {
      setNotesLoading(true);
      setNotesError(null);
      try {
        await reloadNotes(activeBookIdForAi);
      } catch (err) {
        setNotesError(err instanceof Error ? err.message : "Failed to load notes.");
      } finally {
        setNotesLoading(false);
      }
    };

    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookIdForAi]);

  useEffect(() => {
    if (!activeBookIdForAi) {
      setKnowledgePoints([]);
      return;
    }

    const fetchKnowledgePoints = async () => {
      setKnowledgePointsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("book_id", activeBookIdForAi);
        params.set("limit", "50");
        const res = await fetch(`/api/knowledge/points?${params}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (res.ok) {
          const data: KnowledgePointItem[] = await res.json();
          setKnowledgePoints(Array.isArray(data) ? data : []);
        }
      } catch {
        /* ignore */
      } finally {
        setKnowledgePointsLoading(false);
      }
    };

    fetchKnowledgePoints();
  }, [activeBookIdForAi]);

  useEffect(() => {
    const page = searchParams.get("page");
    if (page) {
      const pageNum = Number(page);
      if (!isNaN(pageNum) && pageNum > 0) {
        if (activeFileType === "markdown") {
          setMarkdownJumpSection(pageNum);
        } else {
          setJumpToPage(pageNum);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPage =
    activeFileType === "pdf" ? currentPdfPage :
    activeFileType === "epub" ? Math.round(epubProgress) :
    activeMarkdownSectionIndex;

  if (loading) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        {isTauri && <BareTitleBar />}
        <div className="p-8 text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        {isTauri && <BareTitleBar />}
        <div className="p-8 text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button onClick={() => navigate("/")} className="text-blue-600 hover:underline">
            ← Back to Bookshelf
          </button>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        {isTauri && <BareTitleBar />}
        <div className="p-8 text-center">Book not found</div>
      </div>
    );
  }

  const renderReaderContent = () =>
    activeFileType === "pdf" ? (
      <PDFViewer
        bookId={localFile ? undefined : id!}
        fileUrlOverride={localFile?.type === "pdf" ? localFile.url : undefined}
        initPage={jumpToPage ?? book.current_page ?? 1}
        jumpToPage={jumpToPage}
        onTextSelected={handleTextSelected}
        onPageChange={setCurrentPdfPage}
        onTotalPagesChange={setPdfTotalPages}
      />
    ) : activeFileType === "markdown" ? (
      (localFile?.type === "markdown" ? localFile.url : book.file_url) ? (
        <MarkdownViewer
          ref={markdownViewerRef}
          fileUrl={localFile?.type === "markdown" ? localFile.url : book.file_url!}
          bookId={localFile ? (uploadedBookId ? String(uploadedBookId) : undefined) : id}
          onTextSelected={handleTextSelected}
          jumpToSection={markdownJumpSection}
          showSidebar={!isDesktop}
          onSidebarEntriesChange={setMarkdownSidebarEntries}
          onActiveSectionChange={setActiveMarkdownSectionIndex}
        />
      ) : null
    ) : (
      <EPUBViewer
        ref={epubViewerRef}
        bookId={localFile ? undefined : id!}
        fileUrlOverride={localFile?.type === "epub" ? localFile.url : undefined}
        onTextSelected={handleTextSelected}
        onProgressChange={setEpubProgress}
        showSidebar={true}
      />
    );

  return (
    <>
    <div className="h-screen overflow-hidden flex flex-col">
      {isTauri && <BareTitleBar />}
      <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="justify-self-start">
            <button onClick={() => navigate("/")} className="text-blue-600 hover:underline dark:text-blue-400">
              <ArrowBack fontSize="small" />
            </button>
          </div>

          <h1 className="max-w-[55vw] truncate text-xl font-bold text-gray-900 md:text-2xl text-center dark:text-gray-100">{activeTitle}</h1>

          <div className="justify-self-end">
            <div className="flex items-center gap-2">
              {(localUploadStatus !== "idle" || indexing) && (
                <span className={`rounded px-2 py-1 text-xs font-medium ${
                  localUploadStatus === "uploading"
                    ? "bg-blue-50 text-blue-700"
                    : indexing
                      ? "bg-purple-50 text-purple-700"
                      : localUploadStatus === "uploaded"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                }`}>
                  {localUploadStatus === "uploading"
                    ? "Uploading"
                    : indexing
                      ? "Indexing…"
                      : localUploadStatus === "uploaded"
                        ? "Indexed"
                        : "Upload failed"}
                </span>
              )}
              <input
                ref={localFileInputRef}
                type="file"
                accept=".pdf,.epub,.md,.markdown"
                onChange={handlePickLocalFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => localFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Open local file"
              >
                <UploadFileOutlined fontSize="small" />
                Open local
              </button>
              {activeFileType === "markdown" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  title="Reader settings"
                  onClick={onOpenSetting}
                >
                  <SettingsOutlined fontSize="small" />
                </button>
              )}
            </div>
          </div>
        </div>
        {localUploadMessage && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{localUploadMessage}</div>
        )}
      </header>

      <div className="flex-1 min-h-0">
      {!isDesktop ? (
        <div className="relative flex h-full flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto" style={readerContentStyle}>{renderReaderContent()}</div>

          {!showMobilePanel && (
            <button
              type="button"
              onClick={() => setShowMobilePanel(true)}
              className="fixed bottom-6 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 active:scale-95"
              aria-label="Open AI Panel"
            >
              <AutoAwesomeOutlined fontSize="small" />
            </button>
          )}

          {showMobilePanel && (
            <div className="fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowMobilePanel(false)}
              />
              <div className="absolute bottom-0 right-0 top-0 w-[88vw] max-w-md animate-slide-in-right overflow-hidden border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex h-full flex-col">
                  <AIPanel
                    fileType={activeFileType}
                    selectedExcerpt={selectedExcerpt}
                    learningTagsInput={learningTagsInput}
                    onLearningTagsInputChange={setLearningTagsInput}
                    onClearSelectedExcerpt={() => setSelectedExcerpt("")}
                    onExplainSelection={onExplainSelection}
                    onTranslateSelection={handleTranslateSelection}
                    learningStatus={learningStatus}
                    savingNote={savingNote}
                    savingFlashcard={savingFlashcard}
                    activeBookIdForAi={activeBookIdForAi}
                    currentPage={currentPage}
                    notesLoading={notesLoading}
                    notesError={notesError}
                    notes={notes}
                    editingNoteId={editingNoteId}
                    editingNoteContent={editingNoteContent}
                    onEditingNoteContentChange={setEditingNoteContent}
                    editingNoteTagsInput={editingNoteTagsInput}
                    onEditingNoteTagsInputChange={setEditingNoteTagsInput}
                    savingEditedNoteId={savingEditedNoteId}
                    deletingNoteId={deletingNoteId}
                    onStartEditNote={startEditNote}
                    onCancelEditNote={cancelEditNote}
                    onSaveEditedNote={saveEditedNote}
                    onDeleteNote={handleDeleteNote}
                    onJumpTarget={handleJumpTarget}
                    prefillReferenceTerm={prefillReferenceTerm}
                    knowledgePoints={knowledgePoints}
                    knowledgePointsLoading={knowledgePointsLoading}
                    selectedKpIds={selectedKpIds}
                    onSelectedKpIdsChange={setSelectedKpIds}
                    onCreateNoteFromSelectionWithKp={createNoteFromSelection}
                    onCreateFlashcardFromSelectionWithKp={createFlashcardFromSelection}
                    onPrefillConsumed={() => { setPrefillReferenceTerm(""); }}
                    onNoteSaved={() => { if (activeBookIdForAi) reloadNotes(activeBookIdForAi); }}
                    isMobile
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full">
          {(activeFileType === "pdf" || activeFileType === "markdown") && (
            <>
              <aside className="h-full w-20 shrink-0 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <div className="flex h-full flex-col items-center py-3">
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab("navigation")}
                    className={`rounded-xl p-3 transition ${
                      leftPanelTab === "navigation"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                    }`}
                    title={activeFileType === "pdf" ? "Thumbnails" : "Contents"}
                    aria-label={activeFileType === "pdf" ? "Thumbnails" : "Contents"}
                  >
                    <ViewSidebarOutlined fontSize="small" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab("tags")}
                    className={`mt-2 rounded-xl p-3 transition ${
                      leftPanelTab === "tags"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                    }`}
                    title="Tags"
                    aria-label="Tags"
                  >
                    <LocalOfferOutlined fontSize="small" />
                  </button>
                </div>
              </aside>

              <aside className="h-full w-40 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                {leftPanelTab === "navigation" ? (
                  activeFileType === "pdf" ? (
                    thumbnails
                  ) : markdownSidebarEntries.length > 0 ? (
                    <div className="p-2">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Contents</div>
                      <nav className="space-y-1">
                        {markdownSidebarEntries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => markdownViewerRef.current?.scrollToSection(entry.index)}
                            className={`block w-full truncate rounded px-2 py-1 text-left text-sm transition ${
                              activeMarkdownSectionIndex === entry.index
                                ? "bg-white font-medium text-blue-700 shadow-sm"
                                : "text-gray-700 hover:bg-white"
                            }`}
                            style={{ paddingLeft: `${entry.level * 10}px` }}
                            title={entry.text}
                          >
                            {entry.text}
                          </button>
                        ))}
                      </nav>
                    </div>
                  ) : (
                    <div className="p-2 text-xs text-gray-500">No headings found.</div>
                  )
                ) : (
                  <div className="p-2 text-xs text-gray-600">
                    <div className="mb-2 font-semibold text-gray-700">Tags</div>
                    <div className="rounded border border-dashed border-gray-300 bg-white p-2 text-gray-500">
                      No tags yet.
                    </div>
                  </div>
                )}
              </aside>
            </>
          )}

          <div className="min-w-0 flex-1 overflow-y-auto" style={readerContentStyle}>{renderReaderContent()}</div>

          <aside
            className="relative h-full shrink-0 border-l border-gray-200 dark:border-gray-700"
            style={{ width: aiPanelWidth, minWidth: 280, maxWidth: "60vw" }}
          >
            <div
              className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-blue-400/30 active:bg-blue-400/50"
              onMouseDown={handlePanelDragStart}
            />
            <div className="flex h-full overflow-hidden bg-white dark:bg-gray-900">
              <div className="flex min-w-0 flex-1 flex-col">
                <AIPanel
                  fileType={activeFileType}
                  selectedExcerpt={selectedExcerpt}
                  learningTagsInput={learningTagsInput}
                  onLearningTagsInputChange={setLearningTagsInput}
                  onClearSelectedExcerpt={() => setSelectedExcerpt("")}
                  onExplainSelection={onExplainSelection}
                  onTranslateSelection={handleTranslateSelection}
                  learningStatus={learningStatus}
                  savingNote={savingNote}
                  savingFlashcard={savingFlashcard}
                  activeBookIdForAi={activeBookIdForAi}
                  currentPage={currentPage}
                  notesLoading={notesLoading}
                  notesError={notesError}
                  notes={notes}
                  editingNoteId={editingNoteId}
                  editingNoteContent={editingNoteContent}
                  onEditingNoteContentChange={setEditingNoteContent}
                  editingNoteTagsInput={editingNoteTagsInput}
                  onEditingNoteTagsInputChange={setEditingNoteTagsInput}
                  savingEditedNoteId={savingEditedNoteId}
                  deletingNoteId={deletingNoteId}
                  onStartEditNote={startEditNote}
                  onCancelEditNote={cancelEditNote}
                  onSaveEditedNote={saveEditedNote}
                  onDeleteNote={handleDeleteNote}
                  onJumpTarget={handleJumpTarget}
                  prefillReferenceTerm={prefillReferenceTerm}
                  knowledgePoints={knowledgePoints}
                  knowledgePointsLoading={knowledgePointsLoading}
                  selectedKpIds={selectedKpIds}
                  onSelectedKpIdsChange={setSelectedKpIds}
                  onCreateNoteFromSelectionWithKp={createNoteFromSelection}
                  onCreateFlashcardFromSelectionWithKp={createFlashcardFromSelection}
                  onPrefillConsumed={() => { setPrefillReferenceTerm(""); }}
                  onNoteSaved={() => { if (activeBookIdForAi) reloadNotes(activeBookIdForAi); }}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
      </div>
      {activeFileType !== "markdown" && (
        <footer className="border-t border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          <div className="mb-1 flex items-center justify-between">
            <span>Progress</span>
            <span>{currentPageDisplay} / {totalPageDisplay}</span>
          </div>
          <div className="px-6">
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded bg-blue-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </footer>
      )}
    </div>
      {settingsOpen && (
        <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Reader Settings
            <IconButton size="small" onClick={() => setSettingsOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <FormControl fullWidth margin="normal">
              <InputLabel>Font Family</InputLabel>
              <Select
                value={fontFamily}
                label="Font Family"
                onChange={(e) => setFontFamily(e.target.value)}
              >
                <MenuItem value="sans-serif">Sans Serif</MenuItem>
                <MenuItem value="serif">Serif</MenuItem>
                <MenuItem value="monospace">Monospace</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth margin="normal">
              <InputLabel shrink>Font Size ({fontSize}px)</InputLabel>
              <Slider
                value={fontSize}
                onChange={(_e, val) => setFontSize(val as number)}
                min={12}
                max={24}
                step={1}
                valueLabelDisplay="auto"
                sx={{ mt: 1 }}
              />
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={isFullscreen}
                  onChange={handleToggleFullscreen}
                />
              }
              label="Fullscreen"
              sx={{ mt: 2 }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default Reader;

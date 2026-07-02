import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type AgentToolName = "read" | "write" | "search" | "web_search" | "quiz" | "list_notes";

type AgentStreamEvent = {
  type: "token" | "tool_start" | "tool_end" | "final" | "error";
  text?: string;
  tool?: AgentToolName;
  observation?: unknown;
  output?: string;
  session_id?: string;
  allowed_tools?: AgentToolName[];
  message?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type BookAgentChatProps = {
  bookId: string;
  selectedExcerpt?: string;
  seedPrompt?: string;
  onJumpToPage?: (page: number) => void;
  fileType?: "pdf" | "epub" | "markdown";
  onRequestShowNotes?: () => void;
  onSeedConsumed?: () => void;
  selectedNote?: {
    id: number;
    content: string;
    page: number | null;
    tags: string[];
  } | null;
};

type AgentStep = {
  id: string;
  tool: AgentToolName;
  phase: "start" | "end";
};

type SearchInsight = {
  kind: "search";
  items: Array<{ text: string; page: number | null; score: number | null }>;
};

type ReadInsight = {
  kind: "read";
  items: Array<{ text: string; page: number | null }>;
};

type WebInsight = {
  kind: "web_search";
  items: Array<{ title: string; url: string; source: string }>;
};

type QuizInsight = {
  kind: "quiz";
  items: Array<{ question: string; answer: string }>;
};

type ListNotesInsight = {
  kind: "list_notes";
  items: Array<{ content: string; page: number | null; tags: string[] }>;
};

type ToolInsight = SearchInsight | ReadInsight | WebInsight | QuizInsight | ListNotesInsight;

const ALL_AGENT_TOOLS: AgentToolName[] = ["read", "search", "write", "web_search", "quiz", "list_notes"];

const STORAGE_PREFIX = "smart-reader:agent-chat:v1";

const QUICK_PROMPTS: Record<"pdf" | "epub" | "markdown", string[]> = {
  pdf: [
    "Find key passages from recent pages and summarize them in concise bullet points.",
    "Create 3 quiz questions from this PDF section.",
    "Save useful takeaways as notes with practical tags.",
    "Explain difficult terms and include short web references.",
  ],
  epub: [
    "Summarize this chapter arc and the top 5 ideas.",
    "Generate a short recall quiz for this chapter.",
    "Identify character or concept relationships in this section.",
    "Save study notes from key excerpts.",
  ],
  markdown: [
    "Summarize headings and key points from this markdown document.",
    "Turn this section into a quick checklist for revision.",
    "Create 3 Q&A flash prompts from the current markdown content.",
    "Find external references for unknown terms in this document.",
  ],
};

type PersistedAgentChat = {
  currentSessionId: string;
  sessions: PersistedAgentSession[];
};

type PersistedAgentSession = {
  sessionId: string;
  chat: ChatMessage[];
  allowedTools: AgentToolName[];
  updatedAt: string;
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return createId("session");
}

function normalizeAllowedTools(value: unknown): AgentToolName[] {
  const parsedTools = Array.isArray(value)
    ? value.filter((tool): tool is AgentToolName => ALL_AGENT_TOOLS.includes(tool as AgentToolName))
    : [];
  return parsedTools.length > 0 ? parsedTools : ALL_AGENT_TOOLS;
}

function buildEmptySession(nextSessionId = createSessionId()): PersistedAgentSession {
  return {
    sessionId: nextSessionId,
    chat: [],
    allowedTools: ALL_AGENT_TOOLS,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSession(value: unknown): PersistedAgentSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as {
    sessionId?: unknown;
    chat?: unknown;
    allowedTools?: unknown;
    updatedAt?: unknown;
  };
  const nextSessionId = typeof raw.sessionId === "string" && raw.sessionId.trim()
    ? raw.sessionId
    : createSessionId();

  return {
    sessionId: nextSessionId,
    chat: Array.isArray(raw.chat) ? raw.chat.filter((item): item is ChatMessage => Boolean(item && typeof item === "object")) : [],
    allowedTools: normalizeAllowedTools(raw.allowedTools),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt.trim() ? raw.updatedAt : new Date().toISOString(),
  };
}

function migratePersistedChat(raw: string | null): PersistedAgentChat {
  if (!raw) {
    const session = buildEmptySession();
    return {
      currentSessionId: session.sessionId,
      sessions: [session],
    };
  }

  const parsed = JSON.parse(raw) as {
    currentSessionId?: unknown;
    sessions?: unknown;
    chat?: unknown;
    sessionId?: unknown;
    allowedTools?: unknown;
  };

  if (Array.isArray(parsed.sessions)) {
    const sessions = parsed.sessions
      .map((item) => normalizeSession(item))
      .filter((item): item is PersistedAgentSession => Boolean(item));

    if (sessions.length > 0) {
      const currentSessionId = typeof parsed.currentSessionId === "string" && sessions.some((item) => item.sessionId === parsed.currentSessionId)
        ? parsed.currentSessionId
        : sessions[0].sessionId;
      return { currentSessionId, sessions };
    }
  }

  const legacySession = normalizeSession({
    sessionId: parsed.sessionId,
    chat: parsed.chat,
    allowedTools: parsed.allowedTools,
  }) ?? buildEmptySession();

  return {
    currentSessionId: legacySession.sessionId,
    sessions: [legacySession],
  };
}

function getSessionLabel(session: PersistedAgentSession, index: number): string {
  const firstUserMessage = session.chat.find((item) => item.role === "user")?.content.trim();
  if (firstUserMessage) {
    return firstUserMessage.replace(/\s+/g, " ").slice(0, 28);
  }
  return `Session ${index + 1}`;
}

export default function BookAgentChat({
  bookId,
  selectedExcerpt = "",
  seedPrompt = "",
  onJumpToPage,
  fileType = "pdf",
  onRequestShowNotes,
  onSeedConsumed,
  selectedNote = null,
}: BookAgentChatProps) {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(createSessionId);
  const [allowedTools, setAllowedTools] = useState<AgentToolName[]>(ALL_AGENT_TOOLS);
  const [insights, setInsights] = useState<ToolInsight[]>([]);
  const [savedSessions, setSavedSessions] = useState<PersistedAgentSession[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestSelectedNoteIdRef = useRef<number | null>(null);
  const autoSentSeedRef = useRef<string>('');
  const sendMessageRef = useRef<((msg: string) => Promise<void>) | null>(null);

  const selectedSnippet = useMemo(
    () => selectedExcerpt.trim().replace(/\s+/g, " ").slice(0, 400),
    [selectedExcerpt],
  );

  const quickPrompts = useMemo(() => QUICK_PROMPTS[fileType] || QUICK_PROMPTS.pdf, [fileType]);
  const selectedNoteSnippet = useMemo(() => {
    if (!selectedNote) return "";
    const tagsText = selectedNote.tags.length > 0 ? `Tags: ${selectedNote.tags.join(", ")}` : "";
    const pageText = typeof selectedNote.page === "number" ? `Page: ${selectedNote.page}` : "";
    return [
      "Selected note",
      pageText,
      tagsText,
      `Content: ${selectedNote.content}`,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }, [selectedNote]);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${bookId}`, [bookId]);
  const sessionOptions = useMemo(
    () => [...savedSessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [savedSessions],
  );

  useEffect(() => {
    try {
      const parsed = migratePersistedChat(localStorage.getItem(storageKey));
      const currentSession = parsed.sessions.find((item) => item.sessionId === parsed.currentSessionId) ?? parsed.sessions[0];

      setSavedSessions(parsed.sessions);
      setChat(currentSession.chat);
      setSessionId(currentSession.sessionId);
      setAllowedTools(currentSession.allowedTools);
    } catch {
      const fallback = buildEmptySession();
      setSavedSessions([fallback]);
      setChat([]);
      setSessionId(fallback.sessionId);
      setAllowedTools(ALL_AGENT_TOOLS);
    }

    setAgentSteps([]);
    setInsights([]);
    setError(null);
    setMessage("");
    setLoadedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) {
      return;
    }

    const payload: PersistedAgentChat = {
      currentSessionId: sessionId,
      sessions: savedSessions,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [loadedStorageKey, savedSessions, sessionId, storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) {
      return;
    }

    const nextChat = chat.slice(-50);
    const nextAllowedTools = [...allowedTools];

    setSavedSessions((prev) => {
      const existing = prev.find((item) => item.sessionId === sessionId);
      const hasChanged =
        !existing ||
        JSON.stringify(existing.chat) !== JSON.stringify(nextChat) ||
        JSON.stringify(existing.allowedTools) !== JSON.stringify(nextAllowedTools);

      if (!hasChanged) {
        return prev;
      }

      const nextSession: PersistedAgentSession = {
        sessionId,
        chat: nextChat,
        allowedTools: nextAllowedTools,
        updatedAt: new Date().toISOString(),
      };

      if (!existing) {
        return [nextSession, ...prev];
      }

      return prev.map((item) => (item.sessionId === sessionId ? nextSession : item));
    });
  }, [allowedTools, chat, loadedStorageKey, sessionId, storageKey]);

  useEffect(() => {
    if (!seedPrompt.trim()) return;
    const trimmed = seedPrompt.trim().slice(0, 300);
    setMessage((prev) => (prev.trim() ? prev : trimmed));
    if (autoSentSeedRef.current !== seedPrompt) {
      autoSentSeedRef.current = seedPrompt;
      setTimeout(() => {
        if (sendMessageRef.current && autoSentSeedRef.current === seedPrompt) {
          sendMessageRef.current(trimmed);
        }
        onSeedConsumed?.();
      }, 100);
    }
  }, [seedPrompt, onSeedConsumed]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat, agentSteps, loading]);

  useEffect(() => {
    if (!selectedNote) return;
    if (latestSelectedNoteIdRef.current === selectedNote.id) return;
    latestSelectedNoteIdRef.current = selectedNote.id;

    const bubble = [
      "Selected note for context:",
      selectedNote.page !== null ? `Page ${selectedNote.page}` : "",
      selectedNote.tags.length > 0 ? `#${selectedNote.tags.join(" #")}` : "",
      selectedNote.content,
    ]
      .filter(Boolean)
      .join("\n");

    setChat((prev) => [
      ...prev,
      { id: createId("user-note"), role: "user", content: bubble },
    ]);
  }, [selectedNote]);

  const toggleTool = (tool: AgentToolName) => {
    setAllowedTools((prev) => {
      if (prev.includes(tool)) {
        const next = prev.filter((item) => item !== tool);
        return next.length > 0 ? next : prev;
      }
      return [...prev, tool];
    });
  };

  const pushStep = (tool: AgentToolName, phase: "start" | "end") => {
    const next: AgentStep = {
      id: createId(`step-${tool}`),
      tool,
      phase,
    };
    setAgentSteps((prev) => [...prev, next].slice(-20));
  };

  const isShowNotesIntent = (text: string): boolean => {
    const normalized = text.toLowerCase();
    const hasNotes = /\bnote|notes\b/.test(normalized);
    const wantsShow = /\b(show|get|list|display|open|view)\b/.test(normalized);
    return hasNotes && wantsShow;
  };

  const parseObservation = (raw: unknown): unknown => {
    if (typeof raw !== "string") {
      return raw;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const buildInsight = (tool: AgentToolName, rawObservation: unknown): ToolInsight | null => {
    const observation = parseObservation(rawObservation);
    if (!observation || typeof observation !== "object") {
      return null;
    }

    if (tool === "search") {
      const rows = Array.isArray((observation as { results?: unknown[] }).results)
        ? (observation as { results: unknown[] }).results
        : [];
      const items = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as { text?: unknown; page_start?: unknown; score?: unknown };
          return {
            text: typeof rec.text === "string" ? rec.text : "",
            page: typeof rec.page_start === "number" ? rec.page_start : null,
            score: typeof rec.score === "number" ? rec.score : null,
          };
        })
        .filter((item): item is { text: string; page: number | null; score: number | null } => Boolean(item && item.text))
        .slice(0, 3);

      return items.length > 0 ? { kind: "search", items } : null;
    }

    if (tool === "read") {
      const rows = Array.isArray((observation as { excerpts?: unknown[] }).excerpts)
        ? (observation as { excerpts: unknown[] }).excerpts
        : [];
      const items = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as { text?: unknown; page_start?: unknown };
          return {
            text: typeof rec.text === "string" ? rec.text : "",
            page: typeof rec.page_start === "number" ? rec.page_start : null,
          };
        })
        .filter((item): item is { text: string; page: number | null } => Boolean(item && item.text))
        .slice(0, 3);

      return items.length > 0 ? { kind: "read", items } : null;
    }

    if (tool === "web_search") {
      const rows = Array.isArray((observation as { references?: unknown[] }).references)
        ? (observation as { references: unknown[] }).references
        : [];
      const items = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as { title?: unknown; url?: unknown; source?: unknown };
          if (typeof rec.title !== "string" || typeof rec.url !== "string") return null;
          return {
            title: rec.title,
            url: rec.url,
            source: typeof rec.source === "string" ? rec.source : "web",
          };
        })
        .filter((item): item is { title: string; url: string; source: string } => Boolean(item))
        .slice(0, 3);

      return items.length > 0 ? { kind: "web_search", items } : null;
    }

    if (tool === "quiz") {
      const rows = Array.isArray((observation as { questions?: unknown[] }).questions)
        ? (observation as { questions: unknown[] }).questions
        : [];
      const items = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as { question?: unknown; answer?: unknown };
          if (typeof rec.question !== "string" || typeof rec.answer !== "string") return null;
          return { question: rec.question, answer: rec.answer };
        })
        .filter((item): item is { question: string; answer: string } => Boolean(item))
        .slice(0, 3);

      return items.length > 0 ? { kind: "quiz", items } : null;
    }

    if (tool === "list_notes") {
      const rows = Array.isArray((observation as { notes?: unknown[] }).notes)
        ? (observation as { notes: unknown[] }).notes
        : [];
      const items = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rec = row as { content?: unknown; page?: unknown; tags?: unknown };
          if (typeof rec.content !== "string") return null;
          return {
            content: rec.content,
            page: typeof rec.page === "number" ? rec.page : null,
            tags: Array.isArray(rec.tags) ? rec.tags.filter((tag): tag is string => typeof tag === "string") : [],
          };
        })
        .filter((item): item is { content: string; page: number | null; tags: string[] } => Boolean(item))
        .slice(0, 6);

      return items.length > 0 ? { kind: "list_notes", items } : null;
    }

    return null;
  };

  const sendMessage = async (rawMessage: string) => {
    const clean = rawMessage.trim();
    if (!clean || loading) return;

    if (isShowNotesIntent(clean)) {
      onRequestShowNotes?.();
    }

    const userId = createId("user");
    const assistantId = createId("assistant");

    setLoading(true);
    setError(null);
    setAgentSteps([]);
    setInsights([]);
    setChat((prev) => [
      ...prev,
      { id: userId, role: "user", content: clean },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setMessage("");

    try {
      const payload = {
        message: [
          clean,
          selectedSnippet ? `Selected excerpt:\n${selectedSnippet}` : "",
          selectedNoteSnippet,
        ]
          .filter(Boolean)
          .join("\n\n"),
        session_id: sessionId,
        allowed_tools: allowedTools,
        document_type: fileType,
        top_k: 5,
      };

      const res = await fetch(`/api/books/${bookId}/agent/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Agent stream failed (${res.status})`);
      }

      const streamReader = res.body?.getReader();
      if (!streamReader) {
        throw new Error("Agent stream unavailable in this browser.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let hasTokenOutput = false;

      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const lines = chunk
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());
          if (lines.length === 0) continue;

          let eventPayload: AgentStreamEvent;
          try {
            eventPayload = JSON.parse(lines.join("\n"));
          } catch {
            continue;
          }

          if (eventPayload.type === "token" && eventPayload.text) {
            hasTokenOutput = true;
            setChat((prev) =>
              prev.map((item) =>
                item.id === assistantId
                  ? { ...item, content: item.content + eventPayload.text }
                  : item,
              ),
            );
            continue;
          }

          if (eventPayload.type === "tool_start" && eventPayload.tool) {
            pushStep(eventPayload.tool, "start");
            continue;
          }

          if (eventPayload.type === "tool_end" && eventPayload.tool) {
            pushStep(eventPayload.tool, "end");
            const insight = buildInsight(eventPayload.tool, eventPayload.observation);
            if (insight) {
              setInsights((prev) => [...prev, insight]);
            }
            continue;
          }

          if (eventPayload.type === "final") {
            if (eventPayload.session_id) {
              setSessionId(eventPayload.session_id);
            }
            if (Array.isArray(eventPayload.allowed_tools) && eventPayload.allowed_tools.length > 0) {
              setAllowedTools(eventPayload.allowed_tools);
            }
            if (eventPayload.output && !hasTokenOutput) {
              setChat((prev) =>
                prev.map((item) =>
                  item.id === assistantId ? { ...item, content: eventPayload.output || "" } : item,
                ),
              );
            }
            continue;
          }

          if (eventPayload.type === "error") {
            setError(eventPayload.message || "Agent stream returned an error.");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent stream failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await sendMessage(message);
  };

  const switchSession = (nextSessionId: string) => {
    const nextSession = savedSessions.find((item) => item.sessionId === nextSessionId);
    if (!nextSession || nextSession.sessionId === sessionId) {
      return;
    }

    setSessionId(nextSession.sessionId);
    setChat(nextSession.chat);
    setAllowedTools(nextSession.allowedTools);
    setAgentSteps([]);
    setInsights([]);
    setError(null);
    setMessage("");
  };

  const startNewConversation = () => {
    const nextSession = buildEmptySession();

    setSavedSessions((prev) => [nextSession, ...prev]);
    setChat([]);
    setAgentSteps([]);
    setInsights([]);
    setError(null);
    setMessage("");
    setAllowedTools(ALL_AGENT_TOOLS);
    setSessionId(nextSession.sessionId);
  };

  const buildQuickPromptInput = (prompt: string): string => {
    if (fileType !== "markdown") {
      return prompt;
    }

    return [
      prompt,
      "",
      "Before answering, call the read tool (or search tool) to load relevant chunks from the current markdown document.",
      "Treat this as document-grounded QA: cite headings/sections when possible and avoid generic answers.",
    ].join("\n");
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Unified Agent Chat</p>
        <div className="flex items-center gap-2">
          <select
            value={sessionId}
            onChange={(e) => switchSession(e.target.value)}
            disabled={loading || sessionOptions.length === 0}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            aria-label="Select conversation session"
          >
            {sessionOptions.map((item, index) => (
              <option key={item.sessionId} value={item.sessionId}>
                {getSessionLabel(item, index)}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{fileType.toUpperCase()} · Session: {sessionId.slice(0, 8)}</span>
        </div>
      </div>

      {selectedSnippet && (
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
          Selected text is included in your next message.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {ALL_AGENT_TOOLS.map((tool) => {
          const enabled = allowedTools.includes(tool);
          return (
            <button
              key={tool}
              type="button"
              onClick={() => toggleTool(tool)}
              className={`rounded border px-2 py-1 text-[11px] ${
                enabled
                  ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                  : "border-gray-300 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {enabled ? "On" : "Off"} {tool}
            </button>
          );
        })}
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
        {chat.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Ask one question and the agent will decide tools for search, notes, references, and quiz.
          </div>
        ) : (
          chat.map((item) => (
            <div
              key={item.id}
              className={`rounded px-2 py-1.5 text-sm ${
                item.role === "user" ? "ml-6 bg-blue-600 text-white" : "mr-6 bg-white text-gray-800 dark:bg-gray-700 dark:text-gray-200"
              }`}
            >
              {item.role === "assistant" ? (
                <div className="space-y-2">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({ children }) => <h1 className="mb-4 mt-6 text-3xl font-bold text-gray-900 first:mt-0 dark:text-gray-100">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-3 mt-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-2 mt-5 text-xl font-semibold text-gray-900 dark:text-gray-100">{children}</h3>,
                      h4: ({ children }) => <h4 className="mb-2 mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{children}</h4>,
                      h5: ({ children }) => <h5 className="mb-2 mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">{children}</h5>,
                      h6: ({ children }) => <h6 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{children}</h6>,
                      p: ({ children }) => <p className="mb-4 leading-7 text-gray-800 dark:text-gray-300">{children}</p>,
                      ul: ({ children }) => <ul className="mb-4 list-disc pl-6 text-gray-800 dark:text-gray-300">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-4 list-decimal pl-6 text-gray-800 dark:text-gray-300">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      blockquote: ({ children }) => <blockquote className="mb-4 border-l-4 border-blue-200 bg-blue-50 px-4 py-2 text-gray-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-gray-300">{children}</blockquote>,
                      code: ({ className, children, ...props }: { className?: string; children?: ReactNode; inline?: boolean }) => {
                        const inline = !className;
                        if (inline) {
                          return (
                            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-pink-700 dark:bg-gray-800 dark:text-pink-400" {...props}>{children}</code>
                          );
                        }
                        const codeText = String(children ?? "").replace(/\n$/, "");
                        return (
                          <span className="group relative block">
                            <button
                              type="button"
                              onClick={(e) => {
                                navigator.clipboard.writeText(codeText);
                                const btn = e.currentTarget;
                                btn.textContent = "Copied!";
                                setTimeout(() => { btn.textContent = "Copy"; }, 1500);
                              }}
                              className="absolute right-2 top-2 z-10 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 opacity-0 transition group-hover:opacity-100 hover:bg-gray-600"
                            >
                              Copy
                            </button>
                            <code className="block overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-sm text-gray-100" {...props}>{children}</code>
                          </span>
                        );
                      },
                      pre: ({ children }) => <pre className="mb-4">{children}</pre>,
                      table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="min-w-full border border-gray-200 text-sm dark:border-gray-700">{children}</table></div>,
                      thead: ({ children }) => <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>,
                      th: ({ children }) => <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">{children}</th>,
                      td: ({ children }) => <td className="border border-gray-200 px-3 py-2 text-gray-800 dark:border-gray-700 dark:text-gray-300">{children}</td>,
                      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">{children}</a>,
                      hr: () => <hr className="my-6 border-gray-200 dark:border-gray-700" />,
                    }}
                  >
                    {item.content || "..."}
                  </ReactMarkdown>
                </div>
              ) : (
                item.content
              )}
            </div>
          ))
        )}

        {agentSteps.length > 0 && (
          <div className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <p className="mb-1 font-semibold text-gray-700 dark:text-gray-200">Tool timeline</p>
            <div className="space-y-1">
              {agentSteps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${step.phase === "start" ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <span className="font-medium text-gray-700 dark:text-gray-200">{step.tool}</span>
                  <span>{step.phase === "start" ? "started" : "finished"}</span>
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">#{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {insights.map((insight, idx) => (
          <div key={`${insight.kind}-${idx}`} className="rounded border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {insight.kind === "search" && (
              <>
                <p className="mb-1 font-semibold text-gray-600 dark:text-gray-300">Search evidence</p>
                <ul className="space-y-1">
                  {insight.items.map((item, itemIdx) => (
                    <li key={`search-${idx}-${itemIdx}`} className="rounded border border-gray-100 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                      <p className="line-clamp-2">{item.text}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {item.page !== null ? `Page ${item.page}` : "No page"}
                          {item.score !== null ? ` · ${(item.score * 100).toFixed(1)}%` : ""}
                        </span>
                        {item.page !== null && onJumpToPage && (
                          <button
                            type="button"
                            onClick={() => onJumpToPage(item.page as number)}
                            className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Go
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {insight.kind === "read" && (
              <>
                <p className="mb-1 font-semibold text-gray-600 dark:text-gray-300">Read excerpts</p>
                <ul className="space-y-1">
                  {insight.items.map((item, itemIdx) => (
                    <li key={`read-${idx}-${itemIdx}`} className="rounded border border-gray-100 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                      <p className="line-clamp-2">{item.text}</p>
                      {item.page !== null && onJumpToPage && (
                        <button
                          type="button"
                          onClick={() => onJumpToPage(item.page as number)}
                          className="mt-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Jump to page {item.page}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {insight.kind === "web_search" && (
              <>
                <p className="mb-1 font-semibold text-gray-600 dark:text-gray-300">Web references</p>
                <ul className="space-y-1">
                  {insight.items.map((item, itemIdx) => (
                    <li key={`web-${idx}-${itemIdx}`} className="rounded border border-gray-100 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline dark:text-blue-400">
                        {item.title}
                      </a>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.source}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {insight.kind === "quiz" && (
              <>
                <p className="mb-1 font-semibold text-gray-600 dark:text-gray-300">Quiz preview</p>
                <ul className="space-y-1">
                  {insight.items.map((item, itemIdx) => (
                    <li key={`quiz-${idx}-${itemIdx}`} className="rounded border border-gray-100 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                      <p className="font-medium">Q: {item.question}</p>
                      <p className="text-gray-600 dark:text-gray-400">A: {item.answer}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {insight.kind === "list_notes" && (
              <>
                <p className="mb-1 font-semibold text-gray-600 dark:text-gray-300">Notes list</p>
                <ul className="space-y-1">
                  {insight.items.map((item, itemIdx) => (
                    <li key={`notes-${idx}-${itemIdx}`} className="rounded border border-gray-100 bg-gray-50 px-2 py-1 dark:border-gray-600 dark:bg-gray-700">
                      <p className="line-clamp-2">{item.content}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        {item.page !== null ? <span>Page {item.page}</span> : <span>No page</span>}
                        {item.tags.map((tag) => (
                          <span key={`${itemIdx}-${tag}`} className="rounded bg-blue-100 px-1 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">#{tag}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
        {error && <div className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

        <div className="mb-2 flex flex-wrap gap-1">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendMessage(buildQuickPromptInput(prompt))}
              disabled={loading}
              className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              {prompt.slice(0, 32)}...
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <button
            type="button"
            onClick={startNewConversation}
            disabled={loading}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
            title="Start a new conversation"
            aria-label="Start a new conversation"
          >
            +
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask anything: search facts, save note, quiz me, or find web refs"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <button
            type="submit"
            disabled={loading || !message.trim()}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Running..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

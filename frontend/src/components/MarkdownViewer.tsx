import { forwardRef, isValidElement, memo, type ReactNode, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import mermaid from "mermaid";
import SmilesDrawer from "smiles-drawer";
import "katex/dist/katex.min.css";

type HeadingItem = {
  id: string;
  text: string;
  level: number;
};

type TocItem = {
  id: string;
  title: string;
  level: number;
  anchor: string;
  order_index: number;
};

export type MarkdownSidebarEntry = {
  id: string;
  text: string;
  level: number;
  index: number;
};

export type MarkdownViewerHandle = {
  scrollToSection: (sectionIndex: number) => void;
};

type MarkdownViewerProps = {
  fileUrl: string;
  bookId?: string;
  onTextSelected?: (text: string) => void;
  jumpToSection?: number;
  showSidebar?: boolean;
  onSidebarEntriesChange?: (entries: MarkdownSidebarEntry[]) => void;
  onActiveSectionChange?: (sectionIndex: number) => void;
};

type SmilesBlockProps = { smiles: string };
type MermaidBlockProps = { chart: string };

function MermaidBlock({ chart }: MermaidBlockProps) {
  const targetId = useId().replace(/:/g, "_");
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const cleaned = chart.trim();
    if (!cleaned) {
      setSvg("");
      setIsRendering(false);
      return () => {
        isCancelled = true;
      };
    }

    setError(null);
    setSvg("");
    setIsRendering(true);

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
    });

    mermaid
      .render(`${targetId}-svg`, cleaned)
      .then(({ svg }) => {
        if (isCancelled) return;
        setSvg(svg);
        setIsRendering(false);
      })
      .catch(() => {
        if (isCancelled) return;
        setSvg("");
        setIsRendering(false);
        setError("Failed to render Mermaid diagram.");
      });

    return () => {
      isCancelled = true;
    };
  }, [chart, targetId]);

  if (error) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border bg-white p-2">
      {isRendering && !svg ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">
          Rendering Mermaid diagram...
        </div>
      ) : null}
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : null}
    </div>
  );
}

function SmilesBlock({ smiles }: SmilesBlockProps) {
  const targetId = useId().replace(/:/g, "_");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleaned = smiles.trim();
    if (!cleaned) return;
    const container = document.getElementById(targetId);
    if (!container) return;
    container.innerHTML = "";
    setError(null);
    SmilesDrawer.parse(
      cleaned,
      (tree: unknown) => {
        try {
          const drawer = new SmilesDrawer.Drawer({ width: 360, height: 220, compactDrawing: true });
          drawer.draw(tree, targetId, "light", false);
        } catch {
          setError("Failed to render SMILES diagram.");
        }
      },
      () => { setError("Invalid SMILES syntax."); },
    );
  }, [smiles, targetId]);

  if (error) {
    return <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">{error}</div>;
  }
  return <div id={targetId} className="overflow-x-auto rounded border bg-white p-2" />;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    return textFromNode((node as { props?: { children?: ReactNode } }).props?.children ?? "");
  }
  return "";
}

const MarkdownViewer = memo(forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer({
  fileUrl,
  bookId,
  onTextSelected,
  jumpToSection,
  showSidebar = true,
  onSidebarEntriesChange,
  onActiveSectionChange,
}, ref) {
  const viewerInstanceId = useId();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleContentMouseUp = useCallback(() => {
    if (!onTextSelected) return;
    const text = window.getSelection()?.toString().trim() || "";
    if (text) {
      onTextSelected(text);
    }
  }, [onTextSelected]);

  useEffect(() => {
    const fetchMarkdown = async () => {
      try {
        setLoading(true);
        setError(null);

        const isBlobLikeUrl = fileUrl.startsWith("blob:") || fileUrl.startsWith("data:");
        const token = localStorage.getItem("token");
        const requestHeaders: Record<string, string> = !isBlobLikeUrl && token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const res = await fetch(fileUrl, {
          headers: requestHeaders,
        });
        if (!res.ok) {
          throw new Error(`Failed to load markdown: ${res.status}`);
        }

        const resForBuffer = res.clone();
        let text = await res.text();
        if (!text) {
          const buffer = await resForBuffer.arrayBuffer();
          text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        }
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load markdown");
      } finally {
        setLoading(false);
      }
    };

    void fetchMarkdown();
  }, [fileUrl]);

  useEffect(() => {
    const fetchToc = async () => {
      if (!bookId) {
        setTocItems([]);
        return;
      }

      try {
        const res = await fetch(`/api/books/${bookId}/toc`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (!res.ok) {
          setTocItems([]);
          return;
        }

        const data = (await res.json()) as TocItem[];
        setTocItems(Array.isArray(data) ? data : []);
      } catch {
        setTocItems([]);
      }
    };

    void fetchToc();
  }, [bookId]);

  const headings = useMemo<HeadingItem[]>(() => {
    const lines = content.split(/\r?\n/);
    const slugCounts = new Map<string, number>();

    return lines.flatMap((line) => {
      const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
      if (!match) return [];

      const [, hashes, rawText] = match;
      const text = rawText.trim();
      const baseSlug = slugify(text) || "section";
      const seen = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, seen + 1);

      return [{
        id: seen === 0 ? baseSlug : `${baseSlug}-${seen}`,
        text,
        level: hashes.length,
      }];
    });
  }, [content]);

  const sidebarEntries = useMemo<MarkdownSidebarEntry[]>(() => {
    if (tocItems.length > 0) {
      return tocItems.map((item, index) => ({
        id: item.id,
        text: item.title,
        level: Math.max(1, item.level),
        index,
      }));
    }

    return headings.map((heading, index) => ({
      id: heading.id,
      text: heading.text,
      level: heading.level,
      index,
    }));
  }, [tocItems, headings]);

  useEffect(() => {
    onSidebarEntriesChange?.(sidebarEntries);
  }, [onSidebarEntriesChange, sidebarEntries]);

  useEffect(() => {
    if (sidebarEntries.length === 0) {
      setActiveSectionIndex(0);
      onActiveSectionChange?.(0);
      return;
    }

    const container = contentRef.current;
    if (!container || headings.length === 0) {
      setActiveSectionIndex(0);
      onActiveSectionChange?.(0);
      return;
    }

    let animationFrameId = 0;

    const updateActiveSection = () => {
      const containerRect = container.getBoundingClientRect();
      let nextIndex = 0;

      headings.forEach((heading, index) => {
        const target = document.getElementById(`${viewerInstanceId}-${heading.id}`);
        if (!target) return;

        const targetRect = target.getBoundingClientRect();
        if (targetRect.top - containerRect.top <= 24) {
          nextIndex = index;
        }
      });

      setActiveSectionIndex((previous) => {
        if (previous === nextIndex) return previous;
        onActiveSectionChange?.(nextIndex);
        return nextIndex;
      });
    };

    const handleScroll = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [headings, onActiveSectionChange, sidebarEntries.length, viewerInstanceId]);

  const headingBuckets = useMemo(() => {
    return headings.reduce<Record<number, HeadingItem[]>>((acc, heading) => {
      const next = acc[heading.level] ?? [];
      next.push(heading);
      acc[heading.level] = next;
      return acc;
    }, {});
  }, [headings]);

  const scrollToHeading = useCallback((headingId: string, behavior: "auto" | "instant" | "smooth" = "smooth") => {
    const container = contentRef.current;
    if (!container) return;

    const target = document.getElementById(`${viewerInstanceId}-${headingId}`);
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = targetRect.top - containerRect.top + container.scrollTop - 12;

    container.scrollTo({
      top: Math.max(0, top),
      behavior,
    });
  }, [viewerInstanceId]);

  const scrollToSection = useCallback((sectionIndex: number) => {
    if (headings.length === 0) {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const sectionCount = sidebarEntries.length || headings.length;
    const safeIndex = Math.max(0, Math.min(sectionIndex, sectionCount - 1));
    const targetHeading = headings[safeIndex];
    if (!targetHeading) return;

    scrollToHeading(targetHeading.id);
  }, [headings, scrollToHeading, sidebarEntries.length]);

  useImperativeHandle(ref, () => ({
    scrollToSection,
  }), [scrollToSection]);

  useEffect(() => {
    if (jumpToSection === undefined || jumpToSection === null) return;

    scrollToSection(jumpToSection);
  }, [jumpToSection, scrollToSection]);

  const markdownBody = useMemo(() => {
    const headingRenderCounts = {
      1: new Map<string, number>(),
      2: new Map<string, number>(),
      3: new Map<string, number>(),
      4: new Map<string, number>(),
      5: new Map<string, number>(),
      6: new Map<string, number>(),
    };

    const makeHeadingRenderer = (level: 1 | 2 | 3 | 4 | 5 | 6, className: string) => {
      return ({ children }: { children?: ReactNode }) => {
        const text = textFromNode(children).trim();
        const rendered = headingRenderCounts[level].get(text) ?? 0;
        headingRenderCounts[level].set(text, rendered + 1);

        const matchingHeadings = (headingBuckets[level] ?? []).filter((item) => item.text === text);
        const id = matchingHeadings[rendered]?.id ?? slugify(text);
        const domId = `${viewerInstanceId}-${id}`;
        const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

        return <Tag id={domId} className={className}>{children}</Tag>;
      };
    };

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: makeHeadingRenderer(1, "mb-4 mt-6 text-3xl font-bold text-gray-900 first:mt-0"),
          h2: makeHeadingRenderer(2, "mb-3 mt-6 text-2xl font-semibold text-gray-900"),
          h3: makeHeadingRenderer(3, "mb-2 mt-5 text-xl font-semibold text-gray-900"),
          h4: makeHeadingRenderer(4, "mb-2 mt-4 text-lg font-semibold text-gray-900"),
          h5: makeHeadingRenderer(5, "mb-2 mt-4 text-base font-semibold text-gray-900"),
          h6: makeHeadingRenderer(6, "mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-600"),
          p: ({ children }) => <p className="mb-4 leading-7 text-gray-800">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 list-disc pl-6 text-gray-800">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal pl-6 text-gray-800">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="mb-4 border-l-4 border-blue-200 bg-blue-50 px-4 py-2 text-gray-700">{children}</blockquote>,
          code: ({ className, children, ...props }: { className?: string; children?: ReactNode; inline?: boolean }) => {
            const isMermaid = /language-mermaid\b/.test(className || "");
            if (isMermaid) return <MermaidBlock chart={String(children ?? "")} />;

            const isSmiles = /language-(smiles|smi)\b/.test(className || "");
            if (isSmiles) return <SmilesBlock smiles={String(children ?? "")} />;

            const inline = !className;
            return inline ? (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-pink-700" {...props}>{children}</code>
            ) : (
              <code className="block overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-sm text-gray-100" {...props}>{children}</code>
            );
          },
          pre: ({ children }) => {
            const codeChild = Array.isArray(children) ? children[0] : children;
            if (isValidElement(codeChild)) {
              const className = (codeChild.props as { className?: string }).className || "";
              if (/language-mermaid\b/.test(className)) {
                return <div className="mb-4">{children}</div>;
              }
              if (/language-(smiles|smi)\b/.test(className)) {
                return <div className="mb-4">{children}</div>;
              }
            }
            return <pre className="mb-4">{children}</pre>;
          },
          table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="min-w-full border border-gray-200 text-sm">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
          th: ({ children }) => <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">{children}</th>,
          td: ({ children }) => <td className="border border-gray-200 px-3 py-2 text-gray-800">{children}</td>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-700">{children}</a>,
          hr: () => <hr className="my-6 border-gray-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }, [content, headingBuckets, viewerInstanceId]);

  if (loading) {
    return <div className="py-8 text-center text-gray-500">Loading markdown...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="flex h-full w-full">
      {showSidebar && sidebarEntries.length > 0 && (
        <aside className="hidden h-full w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 lg:block">
          <div className="p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contents</div>
            <nav className="space-y-1">
              {sidebarEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const targetHeading = headings[entry.index];
                    if (!targetHeading) return;
                    scrollToHeading(targetHeading.id);
                  }}
                  className={`block w-full truncate rounded px-2 py-1 text-left text-sm transition ${
                    activeSectionIndex === entry.index
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
        </aside>
      )}

      <div ref={contentRef} onMouseUp={handleContentMouseUp} className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        {markdownBody}
      </div>
    </div>
  );
}));

MarkdownViewer.displayName = "MarkdownViewer";

export default MarkdownViewer;
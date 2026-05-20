import { isValidElement, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
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

type MarkdownViewerProps = {
  fileUrl: string;
  bookId?: string;
  onTextSelected?: (text: string) => void;
  jumpToSection?: number;
};

type SmilesBlockProps = { smiles: string };

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

export default function MarkdownViewer({ fileUrl, bookId, onTextSelected, jumpToSection }: MarkdownViewerProps) {
  const viewerInstanceId = useId();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!contentRef.current || !onTextSelected) return;

    const handleMouseUp = () => {
      const text = window.getSelection()?.toString().trim() || "";
      if (text) {
        onTextSelected(text);
      }
    };

    const element = contentRef.current;
    element.addEventListener("mouseup", handleMouseUp);
    return () => element.removeEventListener("mouseup", handleMouseUp);
  }, [onTextSelected]);

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

  const sidebarEntries = useMemo(() => {
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

  const headingBuckets = useMemo(() => {
    return headings.reduce<Record<number, HeadingItem[]>>((acc, heading) => {
      const next = acc[heading.level] ?? [];
      next.push(heading);
      acc[heading.level] = next;
      return acc;
    }, {});
  }, [headings]);

  useEffect(() => {
    if (jumpToSection === undefined || jumpToSection === null) return;

    if (headings.length === 0) {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const sectionCount = sidebarEntries.length || headings.length;
    const safeIndex = Math.max(0, Math.min(jumpToSection, sectionCount - 1));
    const targetHeading = headings[safeIndex];
    if (!targetHeading) return;

    const domId = `${viewerInstanceId}-${targetHeading.id}`;
    document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpToSection, headings, sidebarEntries.length, viewerInstanceId]);

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

  if (loading) {
    return <div className="py-8 text-center text-gray-500">Loading markdown...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="flex h-full w-full">
      {sidebarEntries.length > 0 && (
        <aside className="hidden h-full w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 lg:block">
          <div className="p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Contents</div>
            <nav className="space-y-1">
              {sidebarEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    const targetHeading = headings[entry.index];
                    if (!targetHeading) return;
                    const domId = `${viewerInstanceId}-${targetHeading.id}`;
                    document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="block w-full truncate rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-white"
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

      <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
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
      </div>
    </div>
  );
}
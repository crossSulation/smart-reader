import { useTranslation } from "react-i18next";
import { useCallback, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
} from "@mui/material";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { ThemeSegmentedToggle } from "../components/ThemeToggle";
import { READER_SHORTCUTS, type ShortcutDef } from "../constants/shortcuts";
import { clearCache } from "../utils/fileCache";

const shortcutActionLabels: Record<string, { zh: string; en: string }> = {
  "reader.nextPage": { zh: "下一页", en: "Next page" },
  "reader.prevPage": { zh: "上一页", en: "Previous page" },
  "reader.togglePanel": { zh: "切换 AI 面板", en: "Toggle AI panel" },
  "reader.focusSearch": { zh: "聚焦搜索/对话输入", en: "Focus search/chat input" },
  "reader.createNote": { zh: "从选中文本创建笔记", en: "Create note from selection" },
  "reader.toggleFullscreen": { zh: "切换全屏", en: "Toggle fullscreen" },
  "global.toggleDarkMode": { zh: "切换深色模式", en: "Toggle dark mode" },
};

function formatShortcutKey(def: ShortcutDef): string {
  const parts: string[] = [];
  if (def.ctrl) parts.push("Ctrl");
  if (def.shift) parts.push("Shift");
  if (def.meta) parts.push("Meta");
  switch (def.key) {
    case "ArrowRight": parts.push("\u2192"); break;
    case "ArrowLeft": parts.push("\u2190"); break;
    case "Slash": parts.push("/"); break;
    case "KeyD": parts.push("D"); break;
    default: parts.push(def.key);
  }
  return parts.join(" + ");
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || "zh").startsWith("zh") ? "zh" : "en";
  const [exportingNotes, setExportingNotes] = useState(false);
  const [exportingFlashcards, setExportingFlashcards] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ severity: "success" | "error"; message: string } | null>(null);

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportNotes = useCallback(async () => {
    setExportingNotes(true);
    setExportStatus(null);
    try {
      const res = await fetch("/api/learning/notes?limit=200", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed to fetch notes (${res.status})`);
      const notes: { content: string; source_text?: string; page?: number; book_id: number; tags: string[]; created_at: string }[] = await res.json();

      const md = notes.map((n) => {
        const date = new Date(n.created_at).toLocaleDateString();
        const tags = n.tags.length > 0 ? ` #${n.tags.join(" #")}` : "";
        const header = `## ${date} — Book #${n.book_id}${n.page ? ` (p.${n.page})` : ""}${tags}`;
        const body = n.content || n.source_text || "";
        return `${header}\n\n${body}\n`;
      }).join("\n---\n\n");

      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, `smart-reader-notes-${new Date().toISOString().slice(0, 10)}.md`);
      setExportStatus({ severity: "success", message: t("settings.exportSuccess", "Exported successfully.") });
    } catch (err) {
      setExportStatus({ severity: "error", message: err instanceof Error ? err.message : "Export failed" });
    } finally {
      setExportingNotes(false);
    }
  }, [t]);

  const exportFlashcards = useCallback(async () => {
    setExportingFlashcards(true);
    setExportStatus(null);
    try {
      const res = await fetch("/api/learning/flashcards?limit=1000", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed to fetch flashcards (${res.status})`);
      const cards: { front: string; back: string; tags: string[] }[] = await res.json();

      const header = "front,back,tags";
      const rows = cards.map((c) => {
        const front = `"${(c.front || "").replace(/"/g, '""')}"`;
        const back = `"${(c.back || "").replace(/"/g, '""')}"`;
        const tags = c.tags.length > 0 ? `"${c.tags.join(" ")}"` : "";
        return `${front},${back},${tags}`;
      });
      const csv = [header, ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `smart-reader-flashcards-${new Date().toISOString().slice(0, 10)}.csv`);
      setExportStatus({ severity: "success", message: t("settings.exportSuccess", "Exported successfully.") });
    } catch (err) {
      setExportStatus({ severity: "error", message: err instanceof Error ? err.message : "Export failed" });
    } finally {
      setExportingFlashcards(false);
    }
  }, [t]);

  const handleClearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      await clearCache();
      setExportStatus({ severity: "success", message: t("settings.cacheCleared", "Cache cleared.") });
    } catch (err) {
      setExportStatus({ severity: "error", message: err instanceof Error ? err.message : "Failed to clear cache" });
    } finally {
      setClearingCache(false);
    }
  }, [t]);

  const deduped = READER_SHORTCUTS.reduce<ShortcutDef[]>((acc, cur) => {
    const key = formatShortcutKey(cur);
    if (!acc.some((item) => formatShortcutKey(item) === key)) {
      acc.push(cur);
    }
    return acc;
  }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Typography variant="h4" component="h1" gutterBottom>
        {t("common.settings")}
      </Typography>

      <Paper elevation={2} className="p-6 mb-8">
        <Typography variant="h6" gutterBottom>
          {t("settings.appearance")}
        </Typography>

        <Box display="flex" alignItems="center" gap={3} flexWrap="wrap" mb={2}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("settings.language")}
            </Typography>
            <LanguageSwitcher />
          </Box>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("settings.theme")}
            </Typography>
            <ThemeSegmentedToggle />
          </Box>
        </Box>
      </Paper>

      <Paper elevation={2} className="p-6">
        <Typography variant="h6" gutterBottom>
          {t("settings.shortcuts")}
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>
                  {t("settings.shortcutsAction")}
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  {t("settings.shortcutsKey")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deduped.map((def) => (
                <TableRow key={`${def.key}-${def.ctrl}-${def.shift}`}>
                  <TableCell>
                    {shortcutActionLabels[def.action]?.[lang] ?? def.action}
                  </TableCell>
                  <TableCell>
                    <Box
                      component="kbd"
                      sx={{
                        display: "inline-block",
                        px: 1,
                        py: 0.25,
                        fontSize: "0.8rem",
                        fontFamily: "monospace",
                        bgcolor: "grey.100",
                        border: "1px solid",
                        borderColor: "grey.300",
                        borderRadius: 0.75,
                      }}
                    >
                      {formatShortcutKey(def)}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper elevation={2} className="p-6">
        <Typography variant="h6" gutterBottom>
          {t("settings.exportData")}
        </Typography>

        {exportStatus && (
          <Alert severity={exportStatus.severity} sx={{ mb: 2 }} onClose={() => setExportStatus(null)}>
            {exportStatus.message}
          </Alert>
        )}

        <Box display="flex" flexWrap="wrap" gap={2}>
          <Button
            variant="outlined"
            onClick={exportNotes}
            disabled={exportingNotes}
          >
            {exportingNotes ? t("common.loading") : t("settings.exportNotesMd")}
          </Button>
          <Button
            variant="outlined"
            onClick={exportFlashcards}
            disabled={exportingFlashcards}
          >
            {exportingFlashcards ? t("common.loading") : t("settings.exportFlashcardsCsv")}
          </Button>
        </Box>

        <Box mt={2}>
          <Button
            variant="outlined"
            color="secondary"
            size="small"
            onClick={handleClearCache}
            disabled={clearingCache}
          >
            {clearingCache ? t("common.loading") : t("settings.clearCache")}
          </Button>
        </Box>
      </Paper>
    </div>
  );
}

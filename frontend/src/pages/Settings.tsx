import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
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
  Switch,
  FormControlLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { ThemeSegmentedToggle } from "../components/ThemeToggle";
import { READER_SHORTCUTS, type ShortcutDef } from "../constants/shortcuts";
import { clearCache } from "../utils/fileCache";
import { usePrivacyMode } from "../hooks/usePrivacyMode";

interface LLMSettings {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
}

const DEFAULT_LLM: LLMSettings = {
  provider: "mock", model: "llama3", baseUrl: "http://localhost:11434", apiKey: "", maxTokens: 512, temperature: 0.3
};

async function fetchLLMSettings(): Promise<LLMSettings> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/settings/llm", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.ok) {
    const data = await res.json();
    return {
      provider: data.provider || "mock",
      model: data.model || "llama3",
      baseUrl: data.base_url || "http://localhost:11434",
      apiKey: data.api_key || "",
      maxTokens: data.max_tokens ?? 512,
      temperature: data.temperature ?? 0.3,
    };
  }
  return DEFAULT_LLM;
}

async function saveLLMSettings(s: LLMSettings): Promise<void> {
  const token = localStorage.getItem("token");
  await fetch("/api/settings/llm", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: s.provider,
      model: s.model,
      base_url: s.baseUrl,
      api_key: s.apiKey,
      max_tokens: s.maxTokens,
      temperature: s.temperature,
    }),
  });
}

export function getLLMHeaders(): Record<string, string> {
  return {};  // No longer needed; settings are stored server-side
}

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
  const { enabled: privacyMode, toggle: togglePrivacyMode } = usePrivacyMode();
  const [exportingNotes, setExportingNotes] = useState(false);
  const [exportingFlashcards, setExportingFlashcards] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ severity: "success" | "error"; message: string } | null>(null);

  const [llmSettings, setLLMSettings] = useState<LLMSettings>(DEFAULT_LLM);
  const [llmSaved, setLLMSaved] = useState(false);

  useEffect(() => {
    fetchLLMSettings().then(setLLMSettings).catch(() => {});
  }, []);

  const saveLLM = useCallback(async () => {
    try {
      await saveLLMSettings(llmSettings);
      setLLMSaved(true);
      setTimeout(() => setLLMSaved(false), 2000);
    } catch {
      setLLMSaved(false);
    }
  }, [llmSettings]);

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
      const cards: { front: string; back: string; created_at: string }[] = await res.json();

      const csvHeader = "Front,Back,Created\n";
      const csvRows = cards.map((c) => `"${(c.front || "").replace(/"/g, '""')}","${(c.back || "").replace(/"/g, '""')}","${c.created_at}"`).join("\n");
      const blob = new Blob([csvHeader + csvRows], { type: "text/csv;charset=utf-8" });
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
      setExportStatus({ severity: "success", message: t("settings.cacheCleared") });
    } catch {
      setExportStatus({ severity: "error", message: "Failed to clear cache" });
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
    <div className="p-8 mx-auto" style={{ maxWidth: 960 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t("common.settings")}
      </Typography>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appearance */}
        <Paper elevation={2} className="p-5">
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

          <Box>
            <FormControlLabel
              control={<Switch checked={privacyMode} onChange={togglePrivacyMode} />}
              label="Privacy Mode — keep all data local, never send to cloud"
            />
          </Box>
        </Paper>

        {/* LLM Configuration */}
        <Paper elevation={2} className="p-5">
          <Typography variant="h6" gutterBottom>
            LLM Configuration
          </Typography>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block" mb={2}>
            Configure the AI model. Changes apply to knowledge extraction, Q&A, summarization, and quiz generation.
          </Typography>

          <div className="grid grid-cols-2 gap-3">
            <FormControl size="small" fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                value={llmSettings.provider}
                label="Provider"
                onChange={(e) => setLLMSettings({ ...llmSettings, provider: e.target.value })}
              >
                <MenuItem value="mock">mock (no API key)</MenuItem>
                <MenuItem value="openai">openai</MenuItem>
                <MenuItem value="ollama">ollama (local)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Model"
              value={llmSettings.model}
              onChange={(e) => setLLMSettings({ ...llmSettings, model: e.target.value })}
              fullWidth
            />

            <TextField
              size="small"
              label="API Key"
              type="password"
              value={llmSettings.apiKey}
              onChange={(e) => setLLMSettings({ ...llmSettings, apiKey: e.target.value })}
              fullWidth
              className="col-span-2"
            />

            <TextField
              size="small"
              label="Base URL"
              value={llmSettings.baseUrl}
              onChange={(e) => setLLMSettings({ ...llmSettings, baseUrl: e.target.value })}
              fullWidth
              className="col-span-2"
            />

            <TextField
              size="small"
              label="Max Tokens"
              type="number"
              value={llmSettings.maxTokens}
              onChange={(e) => setLLMSettings({ ...llmSettings, maxTokens: Number(e.target.value) })}
              fullWidth
            />

            <TextField
              size="small"
              label="Temperature"
              type="number"
              inputProps={{ step: 0.1, min: 0, max: 2 }}
              value={llmSettings.temperature}
              onChange={(e) => setLLMSettings({ ...llmSettings, temperature: Number(e.target.value) })}
              fullWidth
            />
          </div>

          <Box mt={2} display="flex" alignItems="center" gap={2}>
            <Button variant="contained" size="small" onClick={saveLLM}>
              Save LLM Config
            </Button>
            {llmSaved && (
              <Typography variant="caption" color="success.main">Saved</Typography>
            )}
          </Box>
        </Paper>

        {/* Shortcuts */}
        <Paper elevation={2} className="p-5">
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

        {/* Data Export & Cache */}
        <Paper elevation={2} className="p-5">
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
              size="small"
              onClick={exportNotes}
              disabled={exportingNotes}
            >
              {exportingNotes ? t("common.loading") : t("settings.exportNotesMd")}
            </Button>
            <Button
              variant="outlined"
              size="small"
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
    </div>
  );
}

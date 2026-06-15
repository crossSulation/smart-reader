import { useTranslation } from "react-i18next";
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
} from "@mui/material";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { ThemeSegmentedToggle } from "../components/ThemeToggle";
import { READER_SHORTCUTS, type ShortcutDef } from "../constants/shortcuts";

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
    </div>
  );
}

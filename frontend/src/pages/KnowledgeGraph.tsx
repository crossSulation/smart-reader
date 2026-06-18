import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import KnowledgeGraphCanvas from "../components/KnowledgeGraphCanvas";
import KnowledgeList from "../components/KnowledgeList";
import KnowledgeDetail from "../components/KnowledgeDetail";
import type { GraphData, KnowledgePointItem, KnowledgeStats } from "../types/KnowledgeGraph";

type PanelMode = "list" | "detail" | "none";

export default function KnowledgeGraphPage() {
  const { t } = useTranslation();

  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [points, setPoints] = useState<KnowledgePointItem[]>([]);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [rightPanel, setRightPanel] = useState<PanelMode>("none");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [bookId] = useState<number | null>(null);

  const getAuthHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  }), []);

  const loadGraph = useCallback(async (central?: number) => {
    setGraphLoading(true);
    try {
      const params = new URLSearchParams();
      if (central) params.set("central_kp_id", String(central));
      if (bookId) params.set("book_id", String(bookId));
      const res = await fetch(`/api/knowledge/graph?${params}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: GraphData = await res.json();
        setGraph(data);
      }
    } catch { /* ignore */ }
    finally { setGraphLoading(false); }
  }, [bookId, getAuthHeaders]);

  const loadPoints = useCallback(async () => {
    setPointsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (entityFilter) params.set("entity_type", entityFilter);
      if (bookId) params.set("book_id", String(bookId));
      params.set("limit", "100");
      const res = await fetch(`/api/knowledge/points?${params}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: KnowledgePointItem[] = await res.json();
        setPoints(data);
      }
    } catch { /* ignore */ }
    finally { setPointsLoading(false); }
  }, [search, entityFilter, bookId, getAuthHeaders]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/stats", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: KnowledgeStats = await res.json();
        setStats(data);
      }
    } catch { /* ignore */ }
  }, [getAuthHeaders]);

  useEffect(() => { loadGraph(); loadStats(); }, [loadGraph, loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => loadPoints(), 200);
    return () => clearTimeout(timer);
  }, [loadPoints]);

  const handleNodeClick = useCallback((nodeId: number) => {
    setSelectedNodeId(nodeId);
    setRightPanel("detail");
  }, []);

  const handleNodeDblClick = useCallback((nodeId: number) => {
    loadGraph(nodeId);
    setSelectedNodeId(nodeId);
    setRightPanel("detail");
  }, [loadGraph]);

  const handleListSelect = useCallback((id: number) => {
    setSelectedNodeId(id);
    setRightPanel("detail");
  }, []);

  const handleNavigateTo = useCallback((id: number) => {
    setSelectedNodeId(id);
    setRightPanel("detail");
    loadGraph(id);
  }, [loadGraph]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-700">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {t("knowledge.title", "Knowledge Graph")}
          </h1>
          {stats && (
            <div className="mt-0.5 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>{stats.total_nodes} {t("knowledge.nodes", "nodes")}</span>
              <span>{stats.total_edges} {t("knowledge.edges", "edges")}</span>
              <span>{t("knowledge.density", "Density")}: {stats.density.toFixed(3)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setSelectedNodeId(null); loadGraph(); setRightPanel("none"); }}
            className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800 dark:text-gray-300"
          >
            {t("knowledge.resetview", "Reset View")}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: list */}
        <div className="w-64 shrink-0 overflow-hidden border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <KnowledgeList
            items={points}
            loading={pointsLoading}
            selectedId={selectedNodeId}
            bookId={bookId}
            entityFilter={entityFilter}
            search={search}
            onSelect={handleListSelect}
            onSearchChange={setSearch}
            onEntityFilterChange={setEntityFilter}
          />
        </div>

        {/* Center: graph canvas */}
        <div className="relative flex-1 overflow-hidden bg-gray-50/30 dark:bg-gray-900/30">
          <KnowledgeGraphCanvas
            data={graph}
            loading={graphLoading}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            onNodeDblClick={handleNodeDblClick}
          />
        </div>

        {/* Right panel: detail */}
        {rightPanel !== "none" && (
          <div className="w-72 shrink-0 overflow-hidden border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <KnowledgeDetail
              kpId={selectedNodeId}
              onClose={() => setRightPanel("none")}
              onNavigateTo={handleNavigateTo}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import type { GraphData, GraphNode } from "../types/KnowledgeGraph";
import { useTranslation } from "react-i18next";
interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type Props = {
  data: GraphData | null;
  loading: boolean;
  selectedNodeId: number | null;
  onNodeClick: (nodeId: number) => void;
  onNodeDblClick: (nodeId: number) => void;
};

const ENTITY_COLORS: Record<string, string> = {
  concept: "#6366f1",
  term: "#22c55e",
  person: "#f59e0b",
  event: "#ef4444",
};

const RELATION_LABELS: Record<string, string> = {
  related_to: "knowledge.related",
  prerequisite_of: "knowledge.prerequisite",
  derived_from: "knowledge.derived",
  contradicts: "knowledge.contradicts",
  extends: "knowledge.extends",
};

export default function KnowledgeGraphCanvas({
  data,
  loading,
  selectedNodeId,
  onNodeClick,
  onNodeDblClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Map<number, PositionedNode>>(new Map());
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const { t } = useTranslation();
  const initPositions = useCallback((graphData: GraphData) => {
    const cx = 400;
    const cy = 300;
    const radius = Math.min(cx, cy) - 80;
    const step = (2 * Math.PI) / Math.max(graphData.nodes.length, 1);
    return graphData.nodes.map((n, i) => ({
      ...n,
      x: cx + radius * Math.cos(i * step),
      y: cy + radius * Math.sin(i * step),
      vx: 0,
      vy: 0,
    }));
  }, []);

  useEffect(() => {
    if (!data) return;
    const positioned = initPositions(data);
    setNodes(positioned);
    const map = new Map<number, PositionedNode>();
    positioned.forEach((n) => map.set(n.id, n));
    nodesRef.current = map;
  }, [data, initPositions]);

  useEffect(() => {
    if (nodes.length === 0 || !data) return;

    const edgeMap = new Map<number, number[]>();
    data.edges.forEach((e) => {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
      if (!edgeMap.has(e.target)) edgeMap.set(e.target, []);
      edgeMap.get(e.source)?.push(e.target);
      edgeMap.get(e.target)?.push(e.source);
    });

    let running = true;
    const tick = () => {
      if (!running) return;
      const current = new Map(nodesRef.current);
      const arr = Array.from(current.values());

      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const dx = arr[j].x - arr[i].x;
          const dy = arr[j].y - arr[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          arr[i].vx -= fx;
          arr[i].vy -= fy;
          arr[j].vx += fx;
          arr[j].vy += fy;
        }
      }

      data.edges.forEach((e) => {
        const s = current.get(e.source);
        const targetNode = current.get(e.target);
        if (!s || !targetNode) return;
        const dx = targetNode.x - s.x;
        const dy = targetNode.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.005;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        targetNode.vx -= fx;
        targetNode.vy -= fy;
      });

      const cx = 400;
      const cy = 280;
      arr.forEach((n) => {
        const dx = cx - n.x;
        const dy = cy - n.y;
        n.vx += dx * 0.001;
        n.vy += dy * 0.001;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(20, Math.min(780, n.x));
        n.y = Math.max(20, Math.min(540, n.y));
      });

      nodesRef.current = current;
      setNodes([...arr]);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [nodes.length, data]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
        {t("knowledge.loading", "Loading...")}
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
        {t("knowledge.noKnowledgePoints", "No knowledge points yet. Index a book to get started.")}
      </div>
    );
  }

  const maxLinks = Math.max(1, ...nodes.map((n) => n.link_count));
  const nodeRadius = (n: PositionedNode) => 8 + (n.link_count / Math.max(maxLinks, 1)) * 18;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 800 560"
      className="h-full w-full"
      style={{ background: "radial-gradient(circle, #f8fafc 0%, #e2e8f0 100%)" }}
    >
      <defs>
        {data.edges.map((e) => (
          <marker
            key={e.id}
            id={`arrow-${e.id}`}
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={e.weight > 0.6 ? "#94a3b8" : "#cbd5e1"} />
          </marker>
        ))}
      </defs>

      {data.edges.map((e) => {
        const s = nodes.find((n) => n.id === e.source);
        const targetNode = nodes.find((n) => n.id === e.target);
        if (!s || !targetNode) return null;
        const mx = (s.x + targetNode.x) / 2;
        const my = (s.y + targetNode.y) / 2;
        const relationLabelLangKey = RELATION_LABELS[e.relation_type] || e.relation_type;
        return (
          <g key={e.id}>
            <line
              x1={s.x} y1={s.y} x2={targetNode.x} y2={targetNode.y}
              stroke={e.weight > 0.6 ? "#94a3b8" : "#cbd5e1"}
              strokeWidth={Math.max(1, e.weight * 3)}
              markerEnd={`url(#arrow-${e.id})`}
            />
            <text
              x={mx} y={my - 4}
              textAnchor="middle"
              className="fill-gray-400 text-[9px] select-none pointer-events-none"
            >
              {t(relationLabelLangKey)}
            </text>
          </g>
        );
      })}

      {nodes.map((n) => {
        const r = nodeRadius(n);
        const isSelected = n.id === selectedNodeId;
        return (
          <g
            key={n.id}
            onClick={() => onNodeClick(n.id)}
            onDoubleClick={() => onNodeDblClick(n.id)}
            className="cursor-pointer"
          >
            <circle
              cx={n.x} cy={n.y} r={r}
              fill={ENTITY_COLORS[n.entity_type] || "#94a3b8"}
              stroke={isSelected ? "#1e293b" : "#fff"}
              strokeWidth={isSelected ? 3 : 1.5}
              opacity={isSelected ? 1 : 0.85}
              className="transition-all duration-150"
            />
            <text
              x={n.x} y={n.y + r + 13}
              textAnchor="middle"
              className={`select-none text-[11px] ${isSelected ? "fill-gray-900 font-semibold" : "fill-gray-600"} pointer-events-none`}
            >
              {n.label.length > 14 ? n.label.slice(0, 13) + "\u2026" : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

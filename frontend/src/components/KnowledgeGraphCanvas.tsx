import { useEffect, useRef, useState, useCallback } from "react";
import type { GraphData, GraphNode } from "../types/KnowledgeGraph";
import Skeleton from "./Skeleton";

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
  related_to: "related",
  prerequisite_of: "prerequisite",
  derived_from: "derived",
  contradicts: "contradicts",
  extends: "extends",
};

const MAX_SIM_NODES = 200;

export default function KnowledgeGraphCanvas({
  data,
  loading,
  selectedNodeId,
  onNodeClick,
  onNodeDblClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Map<number, PositionedNode>>(new Map());
  const worldRef = useRef({ w: 800, h: 560 });
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const initPositions = useCallback((graphData: GraphData, w: number, h: number) => {
    const cx = w / 2;
    const cy = h / 2;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(400, rect.width);
    const h = Math.max(300, rect.height);
    worldRef.current = { w, h };
    const positioned = initPositions(data, w, h);
    setNodes(positioned);
    const map = new Map<number, PositionedNode>();
    positioned.forEach((n) => map.set(n.id, n));
    nodesRef.current = map;
  }, [data, initPositions]);

  // ── Canvas drawing ──────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Background
    const { w: worldW, h: worldH } = worldRef.current;
    const grad = ctx.createRadialGradient(worldW / 2, worldH / 2, 0, worldW / 2, worldH / 2, Math.max(worldW, worldH));
    grad.addColorStop(0, isDark ? "#1e293b" : "#f8fafc");
    grad.addColorStop(1, isDark ? "#0f172a" : "#e2e8f0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const arr = Array.from(nodesRef.current.values());
    const maxLinks = Math.max(1, ...arr.map((n) => n.link_count));
    const nodeR = (n: PositionedNode) => 8 + (n.link_count / maxLinks) * 18;

    // ── Viewport culling ──
    const VPAD = 80;
    const rectW = rect.width;
    const rectH = rect.height;
    const visibleNodeIds = new Set<number>();
    arr.forEach((n) => {
      const r = nodeR(n);
      if (
        n.x + r > -VPAD &&
        n.x - r < rectW + VPAD &&
        n.y + r > -VPAD &&
        n.y - r < rectH + VPAD
      ) {
        visibleNodeIds.add(n.id);
      }
    });

    // ── Draw edges ──
    ctx.lineCap = "round";
    data.edges.forEach((e) => {
      const s = nodesRef.current.get(e.source);
      const t = nodesRef.current.get(e.target);
      if (!s || !t) return;
      if (!visibleNodeIds.has(e.source) && !visibleNodeIds.has(e.target)) return;

      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const sr = nodeR(s);
      const tr = nodeR(t);
      const sx = s.x + (dx / dist) * sr;
      const sy = s.y + (dy / dist) * sr;
      const tx = t.x - (dx / dist) * tr;
      const ty = t.y - (dy / dist) * tr;

      const color = e.weight > 0.6
        ? (isDark ? "#94a3b8" : "#64748b")
        : (isDark ? "#475569" : "#cbd5e1");
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, e.weight * 3);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      const headLen = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(
        tx - headLen * Math.cos(angle - Math.PI / 6),
        ty - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        tx - headLen * Math.cos(angle + Math.PI / 6),
        ty - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();

      // Edge label
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2 - 6;
      ctx.font = "9px system-ui";
      ctx.fillStyle = isDark ? "#64748b" : "#94a3b8";
      ctx.textAlign = "center";
      const relLabel = RELATION_LABELS[e.relation_type] || e.relation_type;
      ctx.fillText(relLabel, mx, my);
    });

    // ── Draw nodes ──
    let drawnCount = 0;
    arr.forEach((n) => {
      if (!visibleNodeIds.has(n.id)) return;
      drawnCount++;
      const r = nodeR(n);
      const isSel = n.id === selectedNodeId;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = ENTITY_COLORS[n.entity_type] || "#94a3b8";
      ctx.globalAlpha = isSel ? 1 : 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? (isDark ? "#e2e8f0" : "#1e293b") : (isDark ? "#334155" : "#fff");
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.stroke();

      // Label
      const label = n.label.length > 14 ? n.label.slice(0, 13) + "\u2026" : n.label;
      ctx.font = isSel ? "bold 11px system-ui" : "11px system-ui";
      ctx.fillStyle = isSel
        ? (isDark ? "#e2e8f0" : "#1e293b")
        : (isDark ? "#94a3b8" : "#475569");
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, n.x, n.y + r + 4);
    });

    // ── Stats overlay (bottom-right) ──
    if (drawnCount < arr.length) {
      ctx.font = "10px system-ui";
      ctx.fillStyle = isDark ? "#475569" : "#94a3b8";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${drawnCount} / ${arr.length} nodes`, rectW - 12, rectH - 8);
    }
  }, [data, selectedNodeId, isDark]);

  // ── Force simulation + canvas render loop ────────────────

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
    let frameCount = 0;

    const tick = () => {
      if (!running) return;
      const current = new Map(nodesRef.current);
      const arr = Array.from(current.values());

      // Cap physics simulation to MAX_SIM_NODES (prioritize high-link nodes)
      const simNodes = arr.length > MAX_SIM_NODES
        ? [...arr].sort((a, b) => b.link_count - a.link_count).slice(0, MAX_SIM_NODES)
        : arr;
      const simIds = new Set(simNodes.map((n) => n.id));
      const maxLinks = Math.max(1, ...arr.map((n) => n.link_count));

      // Repulsion (simNodes only)
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[j].x - simNodes[i].x;
          const dy = simNodes[j].y - simNodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ri = 8 + (simNodes[i].link_count / Math.max(maxLinks, 1)) * 18;
          const rj = 8 + (simNodes[j].link_count / Math.max(maxLinks, 1)) * 18;
          const minDist = ri + rj + 48;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.5;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            simNodes[i].vx -= fx; simNodes[i].vy -= fy;
            simNodes[j].vx += fx; simNodes[j].vy += fy;
          } else {
            const force = 600 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            simNodes[i].vx -= fx; simNodes[i].vy -= fy;
            simNodes[j].vx += fx; simNodes[j].vy += fy;
          }
        }
      }

      // Spring
      data.edges.forEach((e) => {
        const s = current.get(e.source);
        const t = current.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 180) * 0.003;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx; s.vy += fy;
        t.vx -= fx; t.vy -= fy;
      });

      // Center gravity + dampen + clamp (simulated nodes)
      const { w: ww, h: wh } = worldRef.current;
      arr.forEach((n) => {
        if (simIds.has(n.id)) {
          const ri = 8 + (n.link_count / Math.max(maxLinks, 1)) * 18;
          n.vx += (ww / 2 - n.x) * 0.001;
          n.vy += (wh / 2 - n.y) * 0.001;
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          const margin = ri + 20;
          n.x = Math.max(margin, Math.min(ww - margin, n.x));
          n.y = Math.max(margin, Math.min(wh - margin, n.y));
        }
      });

      // Position non-simulated nodes in an outer ring around the sim center
      if (arr.length > MAX_SIM_NODES) {
        const nonSim = arr.filter((n) => !simIds.has(n.id));
        if (nonSim.length > 0) {
          // Compute centroid of simulated nodes
          let sx = 0, sy = 0;
          simNodes.forEach((n) => { sx += n.x; sy += n.y; });
          sx /= simNodes.length;
          sy /= simNodes.length;

          // Max distance from centroid to any sim node
          let maxDist = 0;
          simNodes.forEach((n) => {
            const d = Math.sqrt((n.x - sx) ** 2 + (n.y - sy) ** 2);
            if (d > maxDist) maxDist = d;
          });
          const ringRadius = Math.max(maxDist + 40, Math.min(ww, wh) * 0.35);

          nonSim.forEach((n, i) => {
            const angle = (2 * Math.PI * i) / nonSim.length;
            n.x = sx + ringRadius * Math.cos(angle);
            n.y = sy + ringRadius * Math.sin(angle);
          });
        }
      }

      nodesRef.current = current;

      // Throttle React state updates to every 3 frames for performance
      if (frameCount % 3 === 0) {
        setNodes([...arr]);
      }
      frameCount++;

      draw();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [nodes.length, data, draw]);

  // ── Canvas resize ───────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      if (w > 0 && h > 0) {
        worldRef.current = { w, h };
      }
      draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [draw]);

  // ── Click / double-click detection ────────────────────────────

  const lastClickRef = useRef<{ time: number; nodeId: number | null }>({ time: 0, nodeId: null });

  const handleMouseEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { w: ww, h: wh } = worldRef.current;
    const mx = (e.clientX - rect.left) * (ww / rect.width);
    const my = (e.clientY - rect.top) * (wh / rect.height);

    const arr = Array.from(nodesRef.current.values());
    const maxLinks = Math.max(1, ...arr.map((n) => n.link_count));
    const nodeR = (n: PositionedNode) => 8 + (n.link_count / maxLinks) * 18;

    // Find hit node (topmost by rendering order)
    let hitId: number | null = null;
    for (const n of arr) {
      const r = nodeR(n);
      const dx = mx - n.x;
      const dy = my - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= r + 4) {
        hitId = n.id;
        break;
      }
    }

    if (hitId !== null) {
      const now = Date.now();
      if (now - lastClickRef.current.time < 300 && lastClickRef.current.nodeId === hitId) {
        onNodeDblClick(hitId);
        lastClickRef.current = { time: 0, nodeId: null };
      } else {
        onNodeClick(hitId);
        lastClickRef.current = { time: now, nodeId: hitId };
        setTimeout(() => {
          if (lastClickRef.current.time === now) {
            lastClickRef.current = { time: 0, nodeId: null };
          }
        }, 300);
      }
    }
  }, [onNodeClick, onNodeDblClick]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Skeleton className="h-64 w-64 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
        No knowledge points yet. Index a book to get started.
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleMouseEvent}
      className="h-full w-full cursor-pointer"
      style={{ touchAction: "none" }}
    />
  );
}

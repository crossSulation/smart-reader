import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip, IconButton } from "@mui/material";
import { BoltOutlined } from "@mui/icons-material";

type CreditStats = {
  balance: number;
  monthly_tokens: number;
  monthly_cost: number;
  reset_at: string | null;
};

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function creditColor(balance: number): string {
  if (balance <= 0) return "#ef4444";
  if (balance <= 10000) return "#f59e0b";
  return "#22c55e";
}

export default function CreditIndicator() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CreditStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/stats", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!stats) return null;

  const color = creditColor(stats.balance);

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>Balance: {formatCredits(stats.balance)} credits</div>
          <div>Monthly usage: {formatCredits(stats.monthly_tokens)} tokens</div>
          {stats.reset_at && (
            <div>Resets: {new Date(stats.reset_at).toLocaleDateString()}</div>
          )}
        </div>
      }
      arrow
    >
      <IconButton
        color="inherit"
        onClick={() => navigate("/billing")}
        size="small"
      >
        <BoltOutlined sx={{ fontSize: 18, color }} />
        <span style={{ fontSize: 12, marginLeft: 4, color, fontWeight: 600 }}>
          {formatCredits(stats.balance)}
        </span>
      </IconButton>
    </Tooltip>
  );
}

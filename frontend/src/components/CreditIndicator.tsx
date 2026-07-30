import { useNavigate } from "react-router-dom";
import { Tooltip, IconButton } from "@mui/material";
import { BoltOutlined } from "@mui/icons-material";
import { useBillingStats } from "../api";

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
  const { data: stats } = useBillingStats();

  if (!stats) return null;

  const balance = (stats as any).balance ?? 0;
  const monthlyTokens = (stats as any).monthly_tokens ?? 0;
  const resetAt = (stats as any).reset_at ?? null;
  const color = creditColor(balance);

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>Balance: {formatCredits(balance)} credits</div>
          <div>Monthly usage: {formatCredits(monthlyTokens)} tokens</div>
          {resetAt && (
            <div>Resets: {new Date(resetAt).toLocaleDateString()}</div>
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
          {formatCredits(balance)}
        </span>
      </IconButton>
    </Tooltip>
  );
}

import { useEffect, useState, useCallback } from "react";

type UsageStats = {
  period: string;
  start_date: string;
  total_tokens: number;
  total_cost: number;
  by_capability: Record<string, { tokens: number; cost: number }>;
};

type UsageItem = {
  id: number;
  capability: string;
  provider: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  credit_cost: number;
  created_at: string | null;
};

type CreditStats = {
  balance: number;
  monthly_tokens: number;
  monthly_cost: number;
  reset_at: string | null;
  daily_usage: Array<{ date: string; tokens: number; cost: number }>;
};

type Pack = {
  id: number;
  name: string;
  credits: number;
  price_cents: number;
};

type Transaction = {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  note: string | null;
  created_at: string | null;
};

type Recommend = {
  suggested_pack_id: number;
  name: string;
  credits: number;
  price_cents: number;
  projected_usage: number;
  free_limit: number;
  projected_shortfall: number;
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function formatDate(s: string | null): string {
  if (!s) return "-";
  return new Date(s).toLocaleString();
}

const CAPABILITY_LABELS: Record<string, string> = {
  qa: "Q&A",
  summary: "Summary",
  agent: "Agent",
  knowledge_extraction: "Knowledge Extraction",
  embedding: "Embedding",
  rerank: "Rerank",
};

export default function Billing() {
  const [stats, setStats] = useState<CreditStats | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [history, setHistory] = useState<UsageItem[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recommendation, setRecommendation] = useState<Recommend | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [purchaseMsg, setPurchaseMsg] = useState("");

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  }), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, ur, pr, tr, rr] = await Promise.all([
        fetch("/api/billing/stats", { headers: authHeaders() }),
        fetch("/api/billing/usage?period=month", { headers: authHeaders() }),
        fetch("/api/billing/packs", { headers: authHeaders() }),
        fetch("/api/billing/transactions?limit=30", { headers: authHeaders() }),
        fetch("/api/billing/recommendation", { headers: authHeaders() }),
      ]);
      if (sr.ok) setStats(await sr.json());
      if (ur.ok) setUsage(await ur.json());

      const hRes = await fetch("/api/billing/usage/history?limit=50", { headers: authHeaders() });
      if (hRes.ok) {
        const hData = await hRes.json();
        setHistory(hData.items || []);
      }

      if (pr.ok) {
        const pData = await pr.json();
        setPacks(pData.packs || []);
      }

      if (tr.ok) {
        const tData = await tr.json();
        setTransactions(tData.items || []);
      }

      if (rr.ok) {
        const rData = await rr.json();
        if (rData.recommendation) setRecommendation(rData.recommendation);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [authHeaders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handlePurchase = async (packId: number) => {
    setPurchasing(packId);
    setPurchaseMsg("");
    try {
      const res = await fetch("/api/billing/purchase", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });
      if (res.ok) {
        setPurchaseMsg("Purchase successful!");
        loadAll();
      } else {
        const err = await res.json();
        setPurchaseMsg(err.detail?.message || "Purchase failed");
      }
    } catch {
      setPurchaseMsg("Network error");
    }
    setPurchasing(null);
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-gray-500">Loading billing data...</div>;
  }

  return (
    <div className="overflow-y-auto p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Billing & Credits</h1>

      {/* Balance Card */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Current Balance</div>
            <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
              {formatNum(stats.balance)}
            </div>
            <div className="text-xs text-gray-400">credits</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Monthly Tokens</div>
            <div className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatNum(stats.monthly_tokens)}
            </div>
            <div className="text-xs text-gray-400">
              {stats.reset_at ? `Resets ${formatDate(stats.reset_at)}` : "No reset scheduled"}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Monthly Cost</div>
            <div className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
              {formatNum(stats.monthly_cost)}
            </div>
            <div className="text-xs text-gray-400">credits consumed this month</div>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30">
          <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">Usage Alert</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Your projected monthly usage ({formatNum(recommendation.projected_usage)} tokens) exceeds the free tier ({formatNum(recommendation.free_limit)}).
            Consider purchasing <strong>{recommendation.name}</strong> ({formatNum(recommendation.credits)} credits) to cover the shortfall.
          </div>
        </div>
      )}

      {/* Capability Breakdown */}
      {usage && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Monthly Usage by Capability</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Capability</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Tokens</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(usage.by_capability).map(([cap, val]) => (
                  <tr key={cap} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{CAPABILITY_LABELS[cap] || cap}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatNum(val.tokens)}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{val.cost.toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold dark:border-gray-600 dark:bg-gray-800">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">Total</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{formatNum(usage.total_tokens)}</td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{usage.total_cost.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Credit Packs */}
      {packs.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Credit Packs</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {packs.map((pack) => (
              <div key={pack.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{pack.name}</div>
                <div className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">{formatNum(pack.credits)} credits</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">${(pack.price_cents / 100).toFixed(2)}</div>
                <button
                  onClick={() => handlePurchase(pack.id)}
                  disabled={purchasing === pack.id}
                  className="mt-3 w-full rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {purchasing === pack.id ? "Processing..." : "Purchase"}
                </button>
              </div>
            ))}
          </div>
          {purchaseMsg && <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">{purchaseMsg}</div>}
        </div>
      )}

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Transaction History</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Balance</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Note</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr key={txn.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        txn.type === "purchase" || txn.type === "admin_grant" || txn.type === "refill"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      }`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className={`px-4 py-2 ${txn.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {txn.amount >= 0 ? "+" : ""}{formatNum(txn.amount)}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatNum(txn.balance_after)}</td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-gray-500 dark:text-gray-400">{txn.note || "-"}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{formatDate(txn.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Token Usage Log */}
      {history.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Recent Token Usage</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Capability</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Model</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Tokens</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Cost</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{CAPABILITY_LABELS[item.capability] || item.capability}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{item.model || item.provider}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatNum(item.total_tokens)}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{item.credit_cost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

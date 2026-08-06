import { useState, useEffect, useCallback } from "react";
import useAuth from "../hooks/useAuth";

const API = "/api/admin";
const token = () => localStorage.getItem("token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

type UserRow = { id: number; username: string; email: string; is_admin: boolean; credits: number; book_count: number; created_at: string | null };
type BookRow = { id: number; title: string; owner_id: number; owner_username: string | null; total_pages: number; progress_percentage: number; chunk_count: number; shared_by: string | null; created_at: string | null };
type CreditRow = { id: number; user_id: number; username: string | null; type: string; amount: number; balance_after: number; note: string | null; created_at: string | null };
type ChunkRow = { id: number; book_id: number; chunk_index: number; text_preview: string; token_count: number; has_embedding: boolean; embedding_model: string | null; created_at: string | null };
type Dashboard = { total_users: number; total_books: number; total_chunks: number; chunks_with_embeddings: number; total_credits: number; total_tokens: number };
type Paginated<T> = { total: number; items: T[] };

const TABS = [
  { key: "dashboard", zh: "仪表盘", en: "Dashboard" },
  { key: "users", zh: "用户管理", en: "Users" },
  { key: "books", zh: "书籍管理", en: "Books" },
  { key: "credits", zh: "积分管理", en: "Credits" },
  { key: "embeddings", zh: "嵌入管理", en: "Embeddings" },
] as const;

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

/* ── Tab helpers ── */

function useTabData() {
  const [tab, setTab] = useState<string>("dashboard");

  // dashboard
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // users
  const [users, setUsers] = useState<Paginated<UserRow>>({ total: 0, items: [] });
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);

  // books
  const [books, setBooks] = useState<Paginated<BookRow>>({ total: 0, items: [] });
  const [bookSearch, setBookSearch] = useState("");
  const [bookPage, setBookPage] = useState(0);
  const [booksLoading, setBooksLoading] = useState(false);

  // credits
  const [credits, setCredits] = useState<Paginated<CreditRow>>({ total: 0, items: [] });
  const [creditUserId, setCreditUserId] = useState("");
  const [creditPage, setCreditPage] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // embeddings
  const [chunks, setChunks] = useState<Paginated<ChunkRow>>({ total: 0, items: [] });
  const [chunkSearch, setChunkSearch] = useState("");
  const [chunkPage, setChunkPage] = useState(0);
  const [chunksLoading, setChunksLoading] = useState(false);

  // grant modal
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantAmount, setGrantAmount] = useState(1000);
  const [grantNote, setGrantNote] = useState("");

  const PAGE_SIZE = 20;

  const fetchDash = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch(`${API}/dashboard`, { headers: headers() });
      if (res.ok) setDash(await res.json());
    } finally { setDashLoading(false); }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(userPage * PAGE_SIZE) });
      if (userSearch) params.set("search", userSearch);
      const res = await fetch(`${API}/users?${params}`, { headers: headers() });
      if (res.ok) setUsers(await res.json());
    } finally { setUsersLoading(false); }
  }, [userSearch, userPage]);

  const fetchBooks = useCallback(async () => {
    setBooksLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(bookPage * PAGE_SIZE) });
      if (bookSearch) params.set("search", bookSearch);
      const res = await fetch(`${API}/books?${params}`, { headers: headers() });
      if (res.ok) setBooks(await res.json());
    } finally { setBooksLoading(false); }
  }, [bookSearch, bookPage]);

  const fetchCredits = useCallback(async () => {
    setCreditsLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(creditPage * PAGE_SIZE) });
      if (creditUserId) params.set("user_id", creditUserId);
      const res = await fetch(`${API}/credits/transactions?${params}`, { headers: headers() });
      if (res.ok) setCredits(await res.json());
    } finally { setCreditsLoading(false); }
  }, [creditUserId, creditPage]);

  const fetchChunks = useCallback(async () => {
    setChunksLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(chunkPage * PAGE_SIZE) });
      if (chunkSearch) params.set("search", chunkSearch);
      const res = await fetch(`${API}/embeddings?${params}`, { headers: headers() });
      if (res.ok) setChunks(await res.json());
    } finally { setChunksLoading(false); }
  }, [chunkSearch, chunkPage]);

  useEffect(() => { fetchDash(); }, [fetchDash]);
  useEffect(() => { if (tab === "users") fetchUsers(); }, [tab, fetchUsers]);
  useEffect(() => { if (tab === "books") fetchBooks(); }, [tab, fetchBooks]);
  useEffect(() => { if (tab === "credits") fetchCredits(); }, [tab, fetchCredits]);
  useEffect(() => { if (tab === "embeddings") fetchChunks(); }, [tab, fetchChunks]);

  return { tab, setTab, dash, dashLoading, users, userSearch, setUserSearch, userPage, setUserPage, usersLoading,
    books, bookSearch, setBookSearch, bookPage, setBookPage, booksLoading,
    credits, creditUserId, setCreditUserId, creditPage, setCreditPage, creditsLoading,
    chunks, chunkSearch, setChunkSearch, chunkPage, setChunkPage, chunksLoading,
    grantOpen, setGrantOpen, grantUserId, setGrantUserId, grantAmount, setGrantAmount, grantNote, setGrantNote,
    fetchUsers, fetchBooks, fetchCredits, fetchChunks, fetchDash,
  };
}

/* ── Main ── */

const Admin = () => {
  const { user } = useAuth();
  const data = useTabData();

  // admin check
  if (user && !(user as any).is_admin) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="text-6xl mb-4">403</div>
          <div className="text-xl">Admin access required</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 pt-2 gap-1 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => data.setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
              data.tab === t.key
                ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-gray-700"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t.en}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {data.tab === "dashboard" && <Dashboard data={data} />}
        {data.tab === "users" && <UsersTab data={data} />}
        {data.tab === "books" && <BooksTab data={data} />}
        {data.tab === "credits" && <CreditsTab data={data} />}
        {data.tab === "embeddings" && <EmbeddingsTab data={data} />}
      </div>

      {/* Grant modal */}
      {data.grantOpen && <GrantModal data={data} />}
    </div>
  );
};

export default Admin;

/* ── Dashboard ── */

const Dashboard = ({ data }: { data: ReturnType<typeof useTabData> }) => {
  if (data.dashLoading || !data.dash) return <div className="text-gray-400">Loading...</div>;
  const d = data.dash;
  const cards: [string, number, string][] = [
    ["Total Users", d.total_users, "users"],
    ["Total Books", d.total_books, "books"],
    ["Total Chunks", d.total_chunks, "chunks"],
    ["With Embeddings", d.chunks_with_embeddings, "embed"],
    ["Total Credits", d.total_credits, "credits"],
    ["Total Tokens", d.total_tokens, "tokens"],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map(([label, value, _]) => (
        <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
          <div className="text-2xl font-bold mt-1">{typeof value === "number" && label.includes("Credits") ? value.toFixed(0) : value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};

/* ── Users Tab ── */

const UsersTab = ({ data }: { data: ReturnType<typeof useTabData> }) => (
  <div>
    <div className="flex gap-2 mb-4">
      <input className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 w-64" placeholder="Search..." value={data.userSearch} onChange={e => { data.setUserSearch(e.target.value); data.setUserPage(0); }} />
      <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm" onClick={data.fetchUsers}>Refresh</button>
    </div>
    {data.usersLoading && <div className="text-gray-400 mb-2">Loading...</div>}
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-2 px-3">ID</th><th>Username</th><th>Email</th><th>Admin</th><th>Credits</th><th>Books</th><th>Created</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.users.items.map(u => (
            <tr key={u.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="py-1.5 px-3">{u.id}</td>
              <td className="py-1.5 px-3 font-medium">{u.username}</td>
              <td className="py-1.5 px-3 text-gray-500">{u.email}</td>
              <td className="py-1.5 px-3">{u.is_admin ? <span className="text-green-600 font-semibold">Yes</span> : "No"}</td>
              <td className="py-1.5 px-3">{u.credits.toFixed(0)}</td>
              <td className="py-1.5 px-3">{u.book_count}</td>
              <td className="py-1.5 px-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
              <td className="py-1.5 px-3">
                <button className="text-blue-600 dark:text-blue-400 text-xs hover:underline mr-2" onClick={async () => {
                  const ok = confirm(`${u.is_admin ? "Revoke" : "Grant"} admin for ${u.username}?`);
                  if (!ok) return;
                  await fetch(`${API}/users/${u.id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ is_admin: !u.is_admin }) });
                  data.fetchUsers();
                }}>{u.is_admin ? "Revoke" : "Make Admin"}</button>
                <button className="text-green-600 dark:text-green-400 text-xs hover:underline" onClick={() => {
                  data.setGrantUserId(String(u.id));
                  data.setGrantAmount(1000);
                  data.setGrantNote("");
                  data.setGrantOpen(true);
                }}>Grant</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pagination total={data.users.total} pageSize={20} page={data.userPage} setPage={data.setUserPage} />
  </div>
);

/* ── Books Tab ── */

const BooksTab = ({ data }: { data: ReturnType<typeof useTabData> }) => (
  <div>
    <div className="flex gap-2 mb-4">
      <input className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 w-64" placeholder="Search by title..." value={data.bookSearch} onChange={e => { data.setBookSearch(e.target.value); data.setBookPage(0); }} />
      <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm" onClick={data.fetchBooks}>Refresh</button>
    </div>
    {data.booksLoading && <div className="text-gray-400 mb-2">Loading...</div>}
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-2 px-3">ID</th><th>Title</th><th>Owner</th><th>Progress</th><th>Chunks</th><th>Shared</th><th>Created</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.books.items.map(b => (
            <tr key={b.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="py-1.5 px-3">{b.id}</td>
              <td className="py-1.5 px-3 font-medium max-w-xs truncate">{b.title}</td>
              <td className="py-1.5 px-3 text-gray-500">{b.owner_username || `#${b.owner_id}`}</td>
              <td className="py-1.5 px-3">{b.progress_percentage.toFixed(0)}%</td>
              <td className="py-1.5 px-3">{b.chunk_count}</td>
              <td className="py-1.5 px-3">{b.shared_by ? <span className="text-purple-600">Yes</span> : "No"}</td>
              <td className="py-1.5 px-3 text-gray-400 text-xs">{formatDate(b.created_at)}</td>
              <td className="py-1.5 px-3">
                <button className="text-red-600 dark:text-red-400 text-xs hover:underline" onClick={async () => {
                  if (!confirm(`Delete "${b.title}"?`)) return;
                  await fetch(`${API}/books/${b.id}`, { method: "DELETE", headers: headers() });
                  data.fetchBooks(); data.fetchDash();
                }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pagination total={data.books.total} pageSize={20} page={data.bookPage} setPage={data.setBookPage} />
  </div>
);

/* ── Credits Tab ── */

const CreditsTab = ({ data }: { data: ReturnType<typeof useTabData> }) => (
  <div>
    <div className="flex gap-2 mb-4">
      <input className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 w-32" placeholder="User ID" value={data.creditUserId} onChange={e => { data.setCreditUserId(e.target.value); data.setCreditPage(0); }} />
      <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm" onClick={data.fetchCredits}>Refresh</button>
      <div className="flex-1" />
      <button className="px-3 py-1.5 bg-green-600 text-white rounded text-sm" onClick={() => { data.setGrantUserId(""); data.setGrantAmount(1000); data.setGrantNote(""); data.setGrantOpen(true); }}>+ Grant Credits</button>
    </div>
    {data.creditsLoading && <div className="text-gray-400 mb-2">Loading...</div>}
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-2 px-3">ID</th><th>User</th><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th><th>Time</th>
          </tr>
        </thead>
        <tbody>
          {data.credits.items.map(c => (
            <tr key={c.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="py-1.5 px-3">{c.id}</td>
              <td className="py-1.5 px-3">{c.username || `#${c.user_id}`}</td>
              <td className="py-1.5 px-3"><TypeBadge type={c.type} /></td>
              <td className="py-1.5 px-3 font-mono">{c.amount > 0 ? "+" : ""}{c.amount.toFixed(0)}</td>
              <td className="py-1.5 px-3 font-mono">{c.balance_after.toFixed(0)}</td>
              <td className="py-1.5 px-3 text-gray-500 max-w-xs truncate">{c.note || "-"}</td>
              <td className="py-1.5 px-3 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pagination total={data.credits.total} pageSize={20} page={data.creditPage} setPage={data.setCreditPage} />
  </div>
);

const TypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    consumption: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    refill: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    purchase: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    admin_grant: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-gray-100 dark:bg-gray-700"}`}>{type}</span>;
};

/* ── Embeddings Tab ── */

const EmbeddingsTab = ({ data }: { data: ReturnType<typeof useTabData> }) => (
  <div>
    <div className="flex gap-2 mb-4">
      <input className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 w-64" placeholder="Search text..." value={data.chunkSearch} onChange={e => { data.setChunkSearch(e.target.value); data.setChunkPage(0); }} />
      <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm" onClick={data.fetchChunks}>Refresh</button>
      <div className="flex-1" />
      <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm" onClick={async () => {
        if (!confirm("Delete all unindexed chunks (without embeddings)?")) return;
        const res = await fetch(`${API}/embeddings/delete-unindexed`, { method: "POST", headers: headers() });
        const body = await res.json();
        alert(`Deleted ${body.deleted_count} chunks.`);
        data.fetchChunks(); data.fetchDash();
      }}>Delete Unindexed</button>
    </div>
    {data.chunksLoading && <div className="text-gray-400 mb-2">Loading...</div>}
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-2 px-3">ID</th><th>Book</th><th>#</th><th>Text</th><th>Tokens</th><th>Embedding</th><th>Model</th><th>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.chunks.items.map(c => (
            <tr key={c.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="py-1.5 px-3">{c.id}</td>
              <td className="py-1.5 px-3">#{c.book_id}</td>
              <td className="py-1.5 px-3">{c.chunk_index}</td>
              <td className="py-1.5 px-3 max-w-md truncate text-gray-600 dark:text-gray-300 font-mono text-xs">{c.text_preview}</td>
              <td className="py-1.5 px-3">{c.token_count}</td>
              <td className="py-1.5 px-3">{c.has_embedding ? <span className="text-green-600 font-semibold">Yes</span> : "No"}</td>
              <td className="py-1.5 px-3 text-gray-400 text-xs">{c.embedding_model || "-"}</td>
              <td className="py-1.5 px-3 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pagination total={data.chunks.total} pageSize={20} page={data.chunkPage} setPage={data.setChunkPage} />
  </div>
);

/* ── Pagination ── */

const Pagination = ({ total, pageSize, page, setPage }: { total: number; pageSize: number; page: number; setPage: (p: number) => void }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
      <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-2 py-1 border dark:border-gray-600 rounded disabled:opacity-30">&lt;</button>
      <span>{page + 1} / {totalPages}</span>
      <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2 py-1 border dark:border-gray-600 rounded disabled:opacity-30">&gt;</button>
      <span className="ml-2">({total} total)</span>
    </div>
  );
};

/* ── Grant Modal ── */

const GrantModal = ({ data }: { data: ReturnType<typeof useTabData> }) => (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => data.setGrantOpen(false)}>
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-96 shadow-lg" onClick={e => e.stopPropagation()}>
      <h3 className="text-lg font-bold mb-4">Grant Credits</h3>
      <label className="block text-sm text-gray-500 mb-1">User ID</label>
      <input className="w-full border dark:border-gray-600 rounded px-3 py-1.5 mb-3 bg-white dark:bg-gray-700 text-sm" type="number" value={data.grantUserId} onChange={e => data.setGrantUserId(e.target.value)} />
      <label className="block text-sm text-gray-500 mb-1">Amount</label>
      <input className="w-full border dark:border-gray-600 rounded px-3 py-1.5 mb-3 bg-white dark:bg-gray-700 text-sm" type="number" min={1} value={data.grantAmount} onChange={e => data.setGrantAmount(Number(e.target.value))} />
      <label className="block text-sm text-gray-500 mb-1">Note</label>
      <input className="w-full border dark:border-gray-600 rounded px-3 py-1.5 mb-4 bg-white dark:bg-gray-700 text-sm" value={data.grantNote} onChange={e => data.setGrantNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="px-4 py-1.5 border dark:border-gray-600 rounded text-sm" onClick={() => data.setGrantOpen(false)}>Cancel</button>
        <button className="px-4 py-1.5 bg-green-600 text-white rounded text-sm" onClick={async () => {
          const res = await fetch(`${API}/credits/grant`, { method: "POST", headers: headers(), body: JSON.stringify({ user_id: Number(data.grantUserId), amount: data.grantAmount, note: data.grantNote }) });
          if (res.ok) {
            alert("Credits granted!");
            data.setGrantOpen(false);
            data.fetchCredits(); data.fetchUsers(); data.fetchDash();
          } else {
            const err = await res.json();
            alert(err.detail || "Failed");
          }
        }}>Grant</button>
      </div>
    </div>
  </div>
);

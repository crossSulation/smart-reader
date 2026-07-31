import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { SearchOutlined, ImportContactsOutlined, AssignmentOutlined, HubOutlined, PersonOutlined, LogoutOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface TabItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
}

const tabs: TabItem[] = [
  { path: "/library", label: "bookshelf", icon: <ImportContactsOutlined />, activeIcon: <ImportContactsOutlined /> },
  { path: "/review", label: "review", icon: <AssignmentOutlined />, activeIcon: <AssignmentOutlined /> },
  { path: "/knowledge", label: "knowledge", icon: <HubOutlined />, activeIcon: <HubOutlined /> },
  { path: "/profile", label: "profile", icon: <PersonOutlined />, activeIcon: <PersonOutlined /> },
];

const tabLabelMap: Record<string, string> = {
  bookshelf: "书架",
  review: "复习",
  knowledge: "知识",
  profile: "我的",
};

export default function MobileNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setSearchValue(searchParams.get('q') || '');
  }, [searchParams]);

  const activeTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.path ?? "/library";

  const handleSearch = useCallback(() => {
    const q = searchValue.trim();
    navigate(q ? `/library?q=${encodeURIComponent(q)}` : "/library");
  }, [searchValue, navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  return (
    <>
      <header className="flex items-center gap-3 bg-white px-4 py-2.5 safe-padding-top dark:bg-gray-900">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 transition dark:bg-slate-800">
          <SearchOutlined sx={{ fontSize: 18 }} className="text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder={t("common.search", "Search books...")}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            inputMode="search"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {searchValue && (
            <button
              onClick={() => { setSearchValue(""); navigate("/library"); }}
              className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-400"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <PersonOutlined sx={{ fontSize: 20 }} />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <PersonOutlined sx={{ fontSize: 16 }} />
                我的
              </Link>
              <Link
                to="/billing"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                积分
              </Link>
              <button
                onClick={() => { setProfileOpen(false); handleLogout(); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <LogoutOutlined sx={{ fontSize: 16 }} />
                登出
              </button>
            </div>
          )}
        </div>
      </header>

      <nav
        className="flex items-center justify-around border-t border-gray-100 bg-white/95 px-1 py-1 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
        style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 0px))" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTab;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-4 py-1.5 text-[11px] font-medium transition-all duration-200 text-slate-400 dark:text-slate-500"
            >
              {isActive && (
                <span className="absolute inset-x-2 -top-0.5 h-0.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              )}
              <span className={isActive ? "text-emerald-600 dark:text-emerald-400" : ""}>{tab.icon}</span>
              <span className={isActive ? "text-emerald-600 dark:text-emerald-400" : ""}>{tabLabelMap[tab.label] || tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

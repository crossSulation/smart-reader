import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { SearchOutlined, ImportContactsOutlined, AssignmentOutlined, HubOutlined, PersonOutlined } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import CreditIndicator from "./CreditIndicator";

interface TabItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabItem[] = [
  { path: "/library", label: "bookshelf", icon: <ImportContactsOutlined /> },
  { path: "/review", label: "review", icon: <AssignmentOutlined /> },
  { path: "/knowledge", label: "knowledge", icon: <HubOutlined /> },
  { path: "/profile", label: "profile", icon: <PersonOutlined /> },
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

  useEffect(() => {
    setSearchValue(searchParams.get('q') || '');
  }, [searchParams]);

  const activeTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.path ?? "/library";

  const handleSearch = useCallback(() => {
    const q = searchValue.trim();
    navigate(q ? `/library?q=${encodeURIComponent(q)}` : "/library");
  }, [searchValue, navigate]);

  return (
    <>
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2 safe-padding-top dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
          <SearchOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
          <input
            type="text"
            placeholder={t("common.search", "Search books...")}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          {searchValue && (
            <button
              onClick={() => { setSearchValue(""); navigate("/library"); }}
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
        </div>
        <CreditIndicator />
      </header>

      <nav className="flex items-center justify-around border-t border-gray-200 bg-white px-2 pb-safe dark:border-gray-700 dark:bg-gray-900"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))" }}>
        {tabs.map((tab) => {
          const isActive = tab.path === activeTab;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition ${
                isActive
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <span className={isActive ? "scale-110" : ""}>{tab.icon}</span>
              <span>{tabLabelMap[tab.label] || tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

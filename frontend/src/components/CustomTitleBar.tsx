import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { ImportContactsOutlined, AssignmentOutlined, HubOutlined, SettingsOutlined, PersonOutlined, SearchOutlined } from '@mui/icons-material';
import { ThemeToggleButton } from './ThemeToggle';
import CreditIndicator from './CreditIndicator';

const CustomTitleBar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const titlebarRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');
  const [isDesktop, setIsDesktop] = useState(() => {
    const ua = navigator.userAgent || '';
    return !/android|iphone|ipad/i.test(ua);
  });

  useEffect(() => {
    if (!isDesktop) return;
    const appWindow = getCurrentWindow();

    appWindow.isMaximized().then(setIsMaximized);

    const unlistenResize = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized());
    });

    const onMinimize = () => appWindow.minimize();
    const onToggleMaximize = () => appWindow.toggleMaximize();
    const onClose = () => appWindow.close();

    const minimizeBtn = document.getElementById('titlebar-minimize');
    const maximizeBtn = document.getElementById('titlebar-maximize');
    const closeBtn = document.getElementById('titlebar-close');

    minimizeBtn?.addEventListener('click', onMinimize);
    maximizeBtn?.addEventListener('click', onToggleMaximize);
    closeBtn?.addEventListener('click', onClose);

    return () => {
      unlistenResize.then((fn) => fn());
      minimizeBtn?.removeEventListener('click', onMinimize);
      maximizeBtn?.removeEventListener('click', onToggleMaximize);
      closeBtn?.removeEventListener('click', onClose);
    };
  }, []);

  const handleTitlebarDoubleClick = () => {
    getCurrentWindow().toggleMaximize();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileOpen && titlebarRef.current && !titlebarRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setProfileOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <div ref={titlebarRef} className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region onDoubleClick={handleTitlebarDoubleClick}>
        <Link to="/library" className="titlebar-brand-icon" data-tauri-drag-region title={t('common.appName')}>
          <ImportContactsOutlined sx={{ fontSize: 22 }} />
        </Link>
        <div className="titlebar-search" data-tauri-drag-region>
          <SearchOutlined className="titlebar-search-icon" sx={{ fontSize: 14 }} />
          <input
            type="text"
            placeholder={t('common.search', 'Search books...')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                navigate(`/library?q=${encodeURIComponent(searchValue.trim())}`);
              }
            }}
            className="titlebar-search-input"
          />
          {searchValue && (
            <button
              onClick={() => { setSearchValue(''); navigate('/library'); }}
              className="titlebar-search-clear"
            >✕</button>
          )}
        </div>
        <CreditIndicator />
        <nav className="titlebar-nav">
          <Link to="/review" className="titlebar-nav-item" title={t('common.review', 'Review')}>
            <AssignmentOutlined sx={{ fontSize: 18 }} />
          </Link>
          <Link to="/knowledge" className="titlebar-nav-item" title={t('common.knowledge')}>
            <HubOutlined sx={{ fontSize: 18 }} />
          </Link>
          <Link to="/settings" className="titlebar-nav-item" title={t('common.settings')}>
            <SettingsOutlined sx={{ fontSize: 18 }} />
          </Link>
          <div className="titlebar-profile-wrap">
            <button
              className={`titlebar-nav-item titlebar-profile-trigger ${profileOpen ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
              title={t('common.profile')}
            >
              <PersonOutlined sx={{ fontSize: 18 }} />
              <svg width="10" height="10" viewBox="0 0 24 24" className={`titlebar-chevron ${profileOpen ? 'open' : ''}`}>
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {profileOpen && (
              <div className="titlebar-dropdown">
                <Link
                  to="/profile"
                  className="titlebar-dropdown-item titlebar-dropdown-link"
                  onClick={() => setProfileOpen(false)}
                >
                  {t('common.profile')}
                </Link>
                <button className="titlebar-dropdown-item titlebar-logout-btn" onClick={handleLogout}>
                  {t('common.logout')}
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
      {isDesktop && (
      <div className="titlebar-controls">
        <ThemeToggleButton />
        <span className="titlebar-button" style={{ pointerEvents: 'none', width: 2 }} />
        <button id="titlebar-minimize" className="titlebar-button" title="Minimize">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 13H5v-2h14z" />
          </svg>
        </button>
        <button id="titlebar-maximize" className="titlebar-button" title={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M8 8h8v8H8zm2 2h4v4h-4z" />
              <path fill="currentColor" d="M4 4h4v2H6v2H4zm14 0h2v4h-2V6h-2V4zm0 14v-2h2v4h-4v-2zm-14 0h4v2H4v-4h2z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M4 4h16v16H4zm2 4v10h12V8z" />
            </svg>
          )}
        </button>
        <button id="titlebar-close" className="titlebar-button titlebar-close-button" title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M13.46 12L19 17.54V19h-1.46L12 13.46L6.46 19H5v-1.46L10.54 12L5 6.46V5h1.46L12 10.54L17.54 5H19v1.46z"
            />
          </svg>
        </button>
      </div>
      )}
    </div>
  );
};

export default CustomTitleBar;

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { ThemeToggleButton } from './ThemeToggle';

const CustomTitleBar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const titlebarRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');

  useEffect(() => {
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
          <svg width="22" height="22" viewBox="0 0 24 24"><path fill="currentColor" d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>
        </Link>
        <div className="titlebar-search" data-tauri-drag-region>
          <svg width="14" height="14" viewBox="0 0 24 24" className="titlebar-search-icon"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"/></svg>
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
        <nav className="titlebar-nav">
          <Link to="/review" className="titlebar-nav-item" title={t('common.review', 'Review')}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m-7 0a1 1 0 0 1 1 1 1 1 0 0 1-1 1 1 1 0 0 1-1-1 1 1 0 0 1 1-1m-2 14 4-4-1.41-1.41L10 14.17l-2.59-2.58L6 13z"/></svg>
          </Link>
          <Link to="/knowledge" className="titlebar-nav-item" title={t('common.knowledge')}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="m12 3-7 7 1.63 1.27L12 7l5.37 4.27L19 10zm0 5L6.5 14.77l1.13 5.23h1.93v-4h4.88v4h1.93l1.13-5.23z"/></svg>
          </Link>
          <Link to="/settings" className="titlebar-nav-item" title={t('common.settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M19.14 12.94a7 7 0 0 0 .07-1h-2.02a5.5 5.5 0 0 1-.07 1zm.78-3h2.02c-.2-.67-.5-1.32-.95-1.87l-1.44 1.43c.2.13.33.28.37.44M12 2a10 10 0 0 0-2.12.24L8.44 3.67A8 8 0 0 1 12 4c.9 0 1.78-.1 2.64-.34l.92-1.43A10 10 0 0 0 12 2M2 12a10 10 0 0 0 2 6l1.8-1.8A8 8 0 0 1 4.44 14H2.3c.13-.68.3-1.34.5-2H2zm2.94-2.94A8 8 0 0 1 12 4c.8 0 1.57.13 2.3.36l.9-1.38A10 10 0 0 0 12 2 10 10 0 0 0 4.95 5.86zM12 20a8 8 0 0 1-6.06-2.8L4.14 19A10 10 0 0 0 12 22a9.9 9.9 0 0 0 5-1.34l-1.44-1.44A7.9 7.9 0 0 1 12 20m7.07-6.93A8 8 0 0 1 12 20c-.8 0-1.57-.13-2.3-.36l-.9 1.38A10 10 0 0 0 12 22a10 10 0 0 0 7.05-2.86z"/></svg>
          </Link>
          <div className="titlebar-profile-wrap">
            <button
              className={`titlebar-nav-item titlebar-profile-trigger ${profileOpen ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
              title={t('common.profile')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4 4 0 0 0 4-4 4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4"/></svg>
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
    </div>
  );
};

export default CustomTitleBar;

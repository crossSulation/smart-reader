import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

const CustomTitleBar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const titlebarRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();

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
      minimizeBtn?.removeEventListener('click', onMinimize);
      maximizeBtn?.removeEventListener('click', onToggleMaximize);
      closeBtn?.removeEventListener('click', onClose);
    };
  }, []);

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
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-brand" data-tauri-drag-region>
          {t('common.appName')}
        </span>
        <nav className="titlebar-nav">
          <Link to="/library" className="titlebar-nav-item">{t('common.home')}</Link>
          <Link to="/review" className="titlebar-nav-item">{t('common.review', 'Review')}</Link>
          <div className="titlebar-profile-wrap">
            <button
              className={`titlebar-nav-item titlebar-profile-trigger ${profileOpen ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
            >
              {t('common.profile')}
              <svg width="10" height="10" viewBox="0 0 24 24" className={`titlebar-chevron ${profileOpen ? 'open' : ''}`}>
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {profileOpen && (
              <div className="titlebar-dropdown">
                <div className="titlebar-dropdown-item">
                  <LanguageSwitcher />
                </div>
                <button className="titlebar-dropdown-item titlebar-logout-btn" onClick={handleLogout}>
                  {t('common.logout')}
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
      <div className="titlebar-controls">
        <button id="titlebar-minimize" className="titlebar-button" title="Minimize">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 13H5v-2h14z" />
          </svg>
        </button>
        <button id="titlebar-maximize" className="titlebar-button" title="Maximize">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path fill="currentColor" d="M4 4h16v16H4zm2 4v10h12V8z" />
          </svg>
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

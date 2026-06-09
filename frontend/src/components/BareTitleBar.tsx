import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const BareTitleBar: React.FC = () => {
  useEffect(() => {
    const appWindow = getCurrentWindow();

    const onMinimize = () => appWindow.minimize();
    const onToggleMaximize = () => appWindow.toggleMaximize();
    const onClose = () => appWindow.close();

    const minimizeBtn = document.getElementById('titlebar-minimize-bare');
    const maximizeBtn = document.getElementById('titlebar-maximize-bare');
    const closeBtn = document.getElementById('titlebar-close-bare');

    minimizeBtn?.addEventListener('click', onMinimize);
    maximizeBtn?.addEventListener('click', onToggleMaximize);
    closeBtn?.addEventListener('click', onClose);

    return () => {
      minimizeBtn?.removeEventListener('click', onMinimize);
      maximizeBtn?.removeEventListener('click', onToggleMaximize);
      closeBtn?.removeEventListener('click', onClose);
    };
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div data-tauri-drag-region />
      <div className="titlebar-controls">
        <button id="titlebar-minimize-bare" className="titlebar-button" title="Minimize">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 13H5v-2h14z" />
          </svg>
        </button>
        <button id="titlebar-maximize-bare" className="titlebar-button" title="Maximize">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path fill="currentColor" d="M4 4h16v16H4zm2 4v10h12V8z" />
          </svg>
        </button>
        <button id="titlebar-close-bare" className="titlebar-button titlebar-close-button" title="Close">
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

export default BareTitleBar;

import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, IconButton, Tooltip, InputBase } from '@mui/material';
import { SearchOutlined, AssignmentOutlined, HubOutlined, SettingsOutlined, PersonOutlined, LogoutOutlined, ImportContactsOutlined } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { ThemeToggleButton } from './components/ThemeToggle';
import CreditIndicator from './components/CreditIndicator';
import CustomTitleBar from './components/CustomTitleBar';
import MobileNav from './components/MobileNav';

const Layout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isNativeDesktop, setIsNativeDesktop] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');

  useEffect(() => {
    setSearchValue(searchParams.get('q') || '');
  }, [searchParams]);

  const handleSearch = useCallback(() => {
    const q = searchValue.trim();
    if (q) {
      navigate(`/library?q=${encodeURIComponent(q)}`);
    } else {
      navigate('/library');
    }
  }, [searchValue, navigate]);

  useEffect(() => {
    invoke<boolean>('is_desktop')
      .then((result) => { if (result) setIsNativeDesktop(true); })
      .catch(() => { /* not in Tauri */ });
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {isNativeDesktop ? (
        <CustomTitleBar />
      ) : isDesktop ? (
        <AppBar position="static" className="safe-padding-top">
          <Toolbar>
            <Tooltip title={t('common.appName')}>
                <IconButton color="inherit" component={Link} to="/library" sx={{ mr: 1 }}>
                  <ImportContactsOutlined />
                </IconButton>
              </Tooltip>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }}>
                <Link to="/library" style={{ textDecoration: 'none', color: 'inherit' }}>
                  {t('common.appName')}
                </Link>
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 1, px: 1.5, py: 0.5, mr: 1, flex: { xs: 1, sm: 'unset' }, maxWidth: 320 }}>
                <SearchOutlined sx={{ color: 'rgba(255,255,255,0.6)', mr: 1 }} fontSize="small" />
                <InputBase
                  placeholder={t('common.search', 'Search books...')}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  sx={{ color: 'inherit', fontSize: 14, width: '100%' }}
                  inputProps={{ 'aria-label': 'search' }}
                />
                {searchValue && (
                  <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.6)' }} onClick={() => { setSearchValue(''); navigate('/library'); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  </IconButton>
                )}
              </Box>

            <CreditIndicator />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title={t('common.review', 'Review')}>
                <IconButton color="inherit" component={Link} to="/review">
                  <AssignmentOutlined />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('common.knowledge', 'Knowledge')}>
                <IconButton color="inherit" component={Link} to="/knowledge">
                  <HubOutlined />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('common.settings')}>
                <IconButton color="inherit" component={Link} to="/settings">
                  <SettingsOutlined />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('common.profile')}>
                <IconButton color="inherit" component={Link} to="/profile">
                  <PersonOutlined />
                </IconButton>
              </Tooltip>
              <ThemeToggleButton />
              <Tooltip title={t('common.logout')}>
                <IconButton color="inherit" onClick={handleLogout}>
                  <LogoutOutlined />
                </IconButton>
              </Tooltip>
            </Box>
          </Toolbar>
        </AppBar>
      ) : (
        <MobileNav />
      )}

      <Box component="main" sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
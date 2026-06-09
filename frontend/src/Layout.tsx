import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { ThemeToggleButton } from './components/ThemeToggle';
import CustomTitleBar from './components/CustomTitleBar';

const Layout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const fetchIsDesktop = async () => {
      const result = await invoke<boolean>('is_desktop');
      setIsDesktop(result);
    };
    fetchIsDesktop();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {!isDesktop ? (
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              <Link to="/library" style={{ textDecoration: 'none', color: 'inherit' }}>
                {t('common.appName')}
              </Link>
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button color="inherit" component={Link} to="/review">
                {t('common.review', 'Review')}
              </Button>
              <Button color="inherit" component={Link} to="/profile">
                {t('common.profile')}
              </Button>
              <ThemeToggleButton />
              <Button color="inherit" onClick={handleLogout}>
                {t('common.logout')}
              </Button>
            </Box>
          </Toolbar>
        </AppBar>
      ) : (
        <CustomTitleBar />
      )}

      <Box component="main" sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
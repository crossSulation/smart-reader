import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';

const Layout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            <Link to="/library" style={{ textDecoration: 'none', color: 'inherit' }}>
              {t('common.appName')}
            </Link>
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Button color="inherit" component={Link} to="/profile">
              {t('common.profile')}
            </Button>
            <LanguageSwitcher />
            <Button color="inherit" onClick={handleLogout}>
              {t('common.logout')}
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      
      <Box component="main" sx={{ p: 3 }}>
        <Outlet />
      </Box>
    </>
  );
};

export default Layout;
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import { invoke } from '@tauri-apps/api/core';
import BareTitleBar from './BareTitleBar';

const PublicLayout: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    invoke<boolean>('is_desktop').then(setIsDesktop).catch(() => {});
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {isDesktop && <BareTitleBar />}
      <Box component="main" sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="safe-padding-top">
        <Outlet />
      </Box>
    </Box>
  );
};

export default PublicLayout;

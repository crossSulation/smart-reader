import React from 'react';
import { useTranslation } from 'react-i18next';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const handleChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    if (value) {
      i18n.changeLanguage(value);
    }
  };

  return (
    <ToggleButtonGroup
      value={i18n.language}
      exclusive
      onChange={handleChange}
      size="small"
      sx={{
        '& .MuiToggleButton-root': {
          px: 1.5,
          py: 0.25,
          fontSize: 12,
          border: '1px solid #bdbdbd !important',
          color: '#616161',
          '&.Mui-selected': {
            bgcolor: '#1976d2',
            color: '#fff',
            borderColor: '#1976d2 !important',
          },
          '&.Mui-selected:hover': {
            bgcolor: '#1565c0',
          },
          '&:hover': {
            bgcolor: 'rgba(25, 118, 210, 0.08)',
          },
        },
      }}
    >
      <ToggleButton value="zh">中文</ToggleButton>
      <ToggleButton value="en">EN</ToggleButton>
    </ToggleButtonGroup>
  );
};

export default LanguageSwitcher;
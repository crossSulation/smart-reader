import { IconButton, Tooltip } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { useThemeContext, type ThemeMode } from '../contexts/ThemeContext';

const iconMap: Record<ThemeMode, React.ReactElement> = {
  light: <LightModeIcon fontSize="small" />,
  dark: <DarkModeIcon fontSize="small" />,
  system: <SettingsBrightnessIcon fontSize="small" />,
};

const labelMap: Record<ThemeMode, string> = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'Follow system',
};

export function ThemeToggleButton() {
  const { mode, toggleColorMode } = useThemeContext();

  return (
    <Tooltip title={labelMap[mode]}>
      <IconButton onClick={toggleColorMode} color="inherit" size="small">
        {iconMap[mode]}
      </IconButton>
    </Tooltip>
  );
}

export function ThemeSegmentedToggle() {
  const { mode, setThemeMode } = useThemeContext();

  const options: { key: ThemeMode; icon: React.ReactElement; label: string }[] = [
    { key: 'light', icon: <LightModeIcon fontSize="small" />, label: 'Light' },
    { key: 'system', icon: <SettingsBrightnessIcon fontSize="small" />, label: 'System' },
    { key: 'dark', icon: <DarkModeIcon fontSize="small" />, label: 'Dark' },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => setThemeMode(opt.key)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
            mode === opt.key
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
          title={opt.label}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

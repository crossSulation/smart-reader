import { useMemo } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import "./i18n";
import "./App.css";
import RouterContainer from "./routers";
import { ThemeProvider as AppThemeProvider, useThemeContext } from "./contexts/ThemeContext";

function MuiThemeWrapper({ children }: { children: React.ReactNode }) {
  const { resolved } = useThemeContext();

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: resolved,
          ...(resolved === "dark"
            ? {
                primary: { main: "#90caf9" },
                secondary: { main: "#f48fb1" },
                background: { default: "#121212", paper: "#1e1e1e" },
              }
            : {
                primary: { main: "#1976d2" },
                secondary: { main: "#e57373" },
                background: { default: "#f5f5f5", paper: "#ffffff" },
              }),
        },
      }),
    [resolved]
  );

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

function App() {
  return (
    <AppThemeProvider>
      <MuiThemeWrapper>
        <RouterContainer />
      </MuiThemeWrapper>
    </AppThemeProvider>
  );
}

export default App;

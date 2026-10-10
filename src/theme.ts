"use client";
import { createTheme } from "@mui/material/styles";
const theme = createTheme({
  cssVariables: { nativeColor: true },
  palette: {
    mode: "light",
    primary: {
      main: "oklch(0.48 0.18 24)",
      light: "oklch(0.65 0.15 24)",
      dark: "oklch(0.36 0.14 24)",
      contrastText: "oklch(1 0 0)",
    },
    background: { default: "oklch(1 0 0)", paper: "oklch(0.97 0 0)" },
    text: { primary: "oklch(0.20 0 0)", secondary: "oklch(0.43 0 0)" },
    divider: "oklch(0.83 0 0)",
  },
  typography: {
    fontFamily: "var(--font-roboto), Arial, sans-serif",
    h1: {
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "-0.025em",
      lineHeight: 1.18,
    },
    h2: { fontSize: "1.4rem", fontWeight: 600, lineHeight: 1.3 },
    h3: { fontSize: "1.125rem", fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 48, borderRadius: 28, paddingInline: 24 },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: 48, minHeight: 48 } },
    },
    MuiCard: { defaultProps: { elevation: 0 } },
    MuiTextField: { defaultProps: { variant: "outlined", fullWidth: true } },
  },
});
export default theme;

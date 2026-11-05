"use client";
import { createTheme } from "@mui/material/styles";
const theme = createTheme({
  cssVariables: { nativeColor: true, colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#ba0c2f",
          dark: "#990a27",
          light: "#fbedf0",
          contrastText: "#ffffff",
        },
        background: { default: "#f7f8fa", paper: "#ffffff" },
        text: { primary: "#18222b", secondary: "#65717c" },
        divider: "#e6e9ed",
        success: { main: "#29755a" },
      },
    },
    dark: {
      palette: {
        primary: {
          main: "#f59aa8",
          dark: "#e97486",
          light: "#492a33",
          contrastText: "#291017",
        },
        background: { default: "#141a20", paper: "#1b232c" },
        text: { primary: "#f0f2f5", secondary: "#b3bdca" },
        divider: "#353d49",
        success: { main: "#8dd6b7" },
      },
    },
  },
  typography: {
    fontFamily: "var(--font-roboto), Arial, sans-serif",
    h1: {
      fontSize: "clamp(1.75rem, 2.5vw, 2.25rem)",
      fontWeight: 650,
      letterSpacing: "-0.035em",
      lineHeight: 1.12,
    },
    h2: {
      fontSize: "1.125rem",
      fontWeight: 650,
      letterSpacing: "-0.02em",
      lineHeight: 1.3,
    },
    h3: { fontSize: "1.08rem", fontWeight: 650, lineHeight: 1.4 },
    h6: { fontWeight: 700, letterSpacing: "-0.02em" },
    body1: { fontSize: ".9375rem", lineHeight: 1.55 },
    body2: { fontSize: ".875rem", lineHeight: 1.5 },
    button: {
      textTransform: "none",
      fontWeight: 650,
      letterSpacing: "-0.01em",
    },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 48,
          borderRadius: 8,
          paddingInline: 16,
          whiteSpace: "normal",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: 48, minHeight: 48, borderRadius: 12 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", borderRadius: 12 },
        outlined: { borderColor: "var(--mui-palette-divider)" },
      },
    },
    MuiCard: { defaultProps: { elevation: 0 } },
    MuiTextField: { defaultProps: { variant: "outlined", fullWidth: true } },
    MuiFormHelperText: {
      styleOverrides: { root: { marginLeft: 0, marginRight: 0 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: "var(--mui-palette-background-paper)",
        },
        input: {
          fontSize: "1rem",
          "&::placeholder": {
            opacity: 1,
            color: "var(--mui-palette-text-secondary)",
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: "0.875rem" },
        message: { minWidth: 0 },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 12, minHeight: 48 } },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
  },
});
export default theme;

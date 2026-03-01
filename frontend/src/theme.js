import { createTheme } from "@mui/material/styles";

// Beige + dark grey — minimal (dark background, beige text)
// Thoughtful, warm, minimalistic theme
const beige = "#DDD0C8";
const darkGrey = "#323232";
const beigeMuted = "#b8a99e";
const surface = "#2a2a2a";
const border = "#404040";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: beige,
      light: "#e8e0d8",
      dark: "#c9beb4",
      contrastText: darkGrey,
    },
    secondary: {
      main: beige,
      light: "#e8e0d8",
      dark: beigeMuted,
      contrastText: darkGrey,
    },
    background: {
      default: darkGrey,
      paper: surface,
    },
    text: {
      primary: beige,
      secondary: beigeMuted,
      disabled: beigeMuted,
    },
    divider: border,
    action: {
      hover: "rgba(221, 208, 200, 0.08)",
      selected: "rgba(221, 208, 200, 0.12)",
    },
  },
  typography: {
    fontFamily: '"DM Sans", sans-serif',
    h1: {
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.02em",
      color: beige,
    },
    h2: {
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 600,
      color: beige,
    },
    body1: {
      fontSize: "0.875rem",
      lineHeight: 1.7,
      color: beige,
    },
    body2: {
      fontSize: "0.8125rem",
      color: beigeMuted,
    },
    caption: {
      fontSize: "0.6875rem",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: beigeMuted,
    },
    button: {
      fontFamily: '"DM Sans", sans-serif',
      textTransform: "none",
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          overflowX: "hidden",
          WebkitTextSizeAdjust: "100%",
        },
        body: {
          backgroundColor: darkGrey,
          color: beige,
          fontFamily: '"DM Sans", sans-serif',
          overflowX: "hidden",
          minWidth: 0,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderColor: border,
          color: beigeMuted,
          "&:hover": {
            borderColor: beige,
            color: beige,
            backgroundColor: "rgba(221, 208, 200, 0.06)",
          },
        },
        containedPrimary: {
          backgroundColor: beige,
          color: darkGrey,
          "&:hover": {
            backgroundColor: "#e8e0d8",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: surface,
            "& fieldset": { borderColor: border },
            "&:hover fieldset": { borderColor: beige },
            "&.Mui-focused fieldset": { borderColor: beige, borderWidth: 1 },
          },
          "& .MuiInputBase-input": {
            color: beige,
          },
          "& .MuiInputBase-input::placeholder": {
            color: beigeMuted,
            opacity: 1,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: surface,
          border: `1px solid ${border}`,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardError: {
          backgroundColor: "rgba(211, 47, 47, 0.12)",
          border: "1px solid rgba(211, 47, 47, 0.3)",
          color: "#ef9a9a",
        },
      },
    },
  },
});

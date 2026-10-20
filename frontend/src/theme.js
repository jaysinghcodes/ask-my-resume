import { createTheme } from "@mui/material/styles";

const bg = "#FCFBF9";
const ink = "#191919";
const text = "#2b2b2b";
const muted = "#6b6b6b";
const hair = "#EAE6E1";
const card = "#FFFFFF";

const sans = '"Inter", system-ui, sans-serif';
const serif = '"Source Serif 4", Georgia, serif';

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: ink,
      contrastText: "#ffffff",
    },
    secondary: {
      main: ink,
      contrastText: "#ffffff",
    },
    background: {
      default: bg,
      paper: card,
    },
    text: {
      primary: text,
      secondary: muted,
    },
    divider: hair,
  },
  typography: {
    fontFamily: sans,
    h1: {
      fontFamily: sans,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      color: ink,
    },
    h2: {
      fontFamily: sans,
      fontWeight: 600,
      color: ink,
    },
    body1: {
      fontFamily: serif,
      fontSize: "1.125rem",
      lineHeight: 1.65,
      color: text,
    },
    body2: {
      fontFamily: sans,
      fontSize: "0.875rem",
      color: muted,
    },
    caption: {
      fontFamily: sans,
      fontSize: "0.75rem",
      letterSpacing: "0.04em",
      color: muted,
    },
    button: {
      fontFamily: sans,
      textTransform: "none",
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          overflowX: "clip",
          WebkitTextSizeAdjust: "100%",
        },
        body: {
          backgroundColor: bg,
          color: text,
          fontFamily: serif,
          overflowX: "clip",
          minWidth: 0,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderColor: hair,
          color: ink,
          borderRadius: 999,
          "&:hover": {
            borderColor: ink,
            backgroundColor: "rgba(25, 25, 25, 0.04)",
          },
        },
        containedPrimary: {
          backgroundColor: ink,
          color: "#ffffff",
          "&:hover": {
            backgroundColor: "#000000",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: card,
            "& fieldset": { borderColor: hair },
            "&:hover fieldset": { borderColor: ink },
            "&.Mui-focused fieldset": { borderColor: ink, borderWidth: 1 },
          },
          "& .MuiInputBase-input": {
            color: ink,
          },
          "& .MuiInputBase-input::placeholder": {
            color: muted,
            opacity: 1,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: card,
          border: `1px solid ${hair}`,
        },
      },
    },
  },
});

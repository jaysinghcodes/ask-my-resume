import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Box } from "@mui/material";
import { NavDrawer } from "./components";
import { ChatPage, AboutPage, ContactPage } from "./pages";

export default function App() {
  return (
    <BrowserRouter basename="/ask-my-resume">
      <Box
        sx={{
          minHeight: "100vh",
          position: "relative",
          pl: { xs: 7, sm: 8 },
          pr: { xs: 1.5, sm: 2 },
          width: "100%",
          maxWidth: "100%",
          overflowX: "hidden",
          boxSizing: "border-box",
        }}
      >
        <NavDrawer />
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
      </Box>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PageShell } from "./components";
import { ChatPage, AboutPage, ContactPage } from "./pages";

export default function App() {
  return (
    <BrowserRouter>
      <PageShell>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
      </PageShell>
    </BrowserRouter>
  );
}

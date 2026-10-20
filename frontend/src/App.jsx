import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PageShell } from "./components";
import { ChatPage, AboutPage, ContactPage } from "./pages";

function routerBasename() {
  const trimmed = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
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

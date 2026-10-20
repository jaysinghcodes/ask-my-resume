import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PageShell, ScrollToHash } from "./components";
import { contactSectionMounted } from "./nav-items";
import { ContactPage, HomePage, NotFoundPage } from "./pages";
import { HOME_SECTIONS } from "./sections";

const contactOnHome = contactSectionMounted(HOME_SECTIONS);

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToHash />
      <PageShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<Navigate to={{ pathname: "/", hash: "ask" }} replace />} />
          <Route
            path="/contact"
            element={
              contactOnHome ? (
                <Navigate to={{ pathname: "/", hash: "contact" }} replace />
              ) : (
                <ContactPage />
              )
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </PageShell>
    </BrowserRouter>
  );
}

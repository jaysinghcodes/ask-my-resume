import { ContactSection } from "./components/ContactSection";
import { ExperienceSection } from "./components/ExperienceSection";
import { ProjectsSection } from "./components/ProjectsSection";
import { ChatPage } from "./pages/ChatPage";

// One list owns the home page and the nav. Array order is the page order.
// `order` is the nav order. A contact entry turns /contact into /#contact.
// Skills sit with Projects and are not a tab.
export const HOME_SECTIONS = [
  { id: "ask", label: "Ask Jay", order: 30, Component: ChatPage },
  { id: "experience", label: "Experience", order: 10, Component: ExperienceSection },
  { id: "projects", label: "Projects", order: 20, Component: ProjectsSection },
  { id: "contact", label: "Contact", order: 40, Component: ContactSection },
];

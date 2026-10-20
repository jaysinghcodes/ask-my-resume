import { ChatPage } from "./pages/ChatPage";

// One list owns the home page and the nav. Add a section here when it renders.
// Experience and Projects join in T12. A contact entry turns /contact into /#contact.
export const HOME_SECTIONS = [
  { id: "ask", label: "Ask Jay", order: 30, Component: ChatPage },
];

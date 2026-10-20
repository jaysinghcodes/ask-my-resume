import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AppRoutes } from "./App.jsx";

/** Render the home page to HTML for the build's prerender step. */
export function renderHome() {
  return renderToString(
    <StaticRouter location="/">
      <AppRoutes />
    </StaticRouter>,
  );
}

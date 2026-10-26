import { Link } from "react-router-dom";
import { usePageMeta } from "../usePageMeta";

export function NotFoundPage() {
  usePageMeta("notFound");
  return (
    <div className="reading not-found">
      <h1>That page doesn't exist.</h1>
      <p>
        <Link to="/">Go back to Ask Jay</Link>
        {" or "}
        <Link to="/contact">get in touch</Link>.
      </p>
    </div>
  );
}

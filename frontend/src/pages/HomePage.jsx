import { Hero } from "../components";
import { HOME_SECTIONS } from "../sections";
import { usePageMeta } from "../usePageMeta";

export function HomePage() {
  usePageMeta("home");
  return (
    <>
      <Hero />
      {HOME_SECTIONS.map(({ id, Component }) => (
        <Component key={id} id={id} />
      ))}
    </>
  );
}

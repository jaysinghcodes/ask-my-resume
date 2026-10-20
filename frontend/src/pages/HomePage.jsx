import { Hero } from "../components";
import { HOME_SECTIONS } from "../sections";

export function HomePage() {
  return (
    <>
      <Hero />
      {HOME_SECTIONS.map(({ id, Component }) => (
        <Component key={id} id={id} />
      ))}
    </>
  );
}

import { HOME_SECTIONS } from "../sections";

export function HomePage() {
  return HOME_SECTIONS.map(({ id, Component }) => <Component key={id} id={id} />);
}

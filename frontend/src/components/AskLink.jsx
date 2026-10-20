import { askAbout } from "./askAbout";

/**
 * @param {{ topic: string, className?: string, children?: import("react").ReactNode }} props
 */
export function AskLink({ topic, className, children }) {
  return (
    <a
      className={className}
      href="#ask"
      data-ask-topic={topic}
      onClick={(event) => {
        event.preventDefault();
        askAbout(topic);
      }}
    >
      {children}
    </a>
  );
}

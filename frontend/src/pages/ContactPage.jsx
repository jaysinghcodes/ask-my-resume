import { contact } from "virtual:kb";
import { usePageMeta } from "../usePageMeta";

const note = [contact.location ? `Based in ${contact.location}` : "", contact.workPreferences]
  .filter(Boolean)
  .join(" · ");

export function ContactPage() {
  usePageMeta("contact");
  return (
    <section className="contact-page">
      <div className="reading">
        <p className="kicker">Contact</p>
        <h1>Get in touch</h1>
        {contact.blurb ? <p className="sub">{contact.blurb}</p> : null}
        {contact.links.length > 0 ? (
          <div className="clist">
            {contact.links.map((link) => {
              const external = !link.url.startsWith("mailto:");
              return (
                <a
                  key={link.label}
                  href={link.url}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                >
                  <span>{link.label}</span>
                  <span>{link.display}</span>
                </a>
              );
            })}
          </div>
        ) : null}
        {note ? <p className="contact-note">{note}</p> : null}
      </div>
    </section>
  );
}

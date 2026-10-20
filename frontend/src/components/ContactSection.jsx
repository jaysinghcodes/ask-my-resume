import { useEffect, useState } from "react";
import { knowledgeBase as defaultKb } from "../data/knowledgeBase";
import { contactView } from "../resume/pageModel";
import { copyText } from "./copyText";
import { Section } from "./Section";

/**
 * @param {{ id?: string, knowledgeBase?: import("../resume/pageModel.js").KnowledgeBase }} [props]
 */
export function ContactSection({ id = "contact", knowledgeBase = defaultKb } = {}) {
  const contact = contactView(knowledgeBase);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function onCopy() {
    const ok = await copyText(contact.email);
    if (ok) setCopied(true);
  }

  return (
    <Section
      id={id}
      className="contact-section"
      kicker="Contact"
      title="Get in touch"
      lede={contact.blurb}
    >
      <div className="contact-list">
        {contact.rows.map((row) => (
          <div key={row.label} className="contact-row">
            <a
              href={row.href}
              {...(row.external ? { target: "_blank", rel: "noreferrer" } : {})}
              {...(row.download ? { download: "" } : {})}
            >
              <span>{row.label}</span>
              <span className="contact-value">{row.value}</span>
            </a>
            {row.copy ? (
              <button type="button" className="copy-email" aria-live="polite" onClick={onCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {contact.closing ? <p className="contact-note">{contact.closing}</p> : null}
    </Section>
  );
}

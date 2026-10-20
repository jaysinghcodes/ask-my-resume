import { AskLink } from "./AskLink";

/**
 * @param {{ project: import("../resume/pageModel.js").ProjectView }} props
 */
export function ProjectCard({ project }) {
  return (
    <article id={project.id} className="project-card">
      <div className="project-image">
        <img
          src={project.image}
          alt={project.alt}
          width={project.width}
          height={project.height}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="project-body">
        <h3>{project.name}</h3>
        <div className="project-tag">{project.tagline}</div>
        <p className="project-summary">{project.summary}</p>
        <div className="project-proof">
          {project.proof.map((part, index) =>
            part.strong ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>,
          )}
        </div>
        <div className="project-stack">{project.stack}</div>
        <div className="project-actions">
          {project.actions.map((action) =>
            action.topic ? (
              <AskLink key={action.label} topic={action.topic} className={action.accent ? "accent" : undefined}>
                {action.label}
              </AskLink>
            ) : (
              <a
                key={action.label}
                href={action.href}
                className={action.accent ? "accent" : undefined}
                {...(action.external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {action.label}
              </a>
            ),
          )}
        </div>
      </div>
    </article>
  );
}

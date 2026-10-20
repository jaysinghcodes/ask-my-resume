import { knowledgeBase as defaultKb } from "../data/knowledgeBase";
import { experienceRoles } from "../resume/pageModel";
import { AskLink } from "./AskLink";
import { Section } from "./Section";

/**
 * @param {{ id?: string, knowledgeBase?: import("../resume/pageModel.js").KnowledgeBase }} [props]
 */
export function ExperienceSection({ id = "experience", knowledgeBase = defaultKb } = {}) {
  const roles = experienceRoles(knowledgeBase);
  return (
    <Section id={id} className="experience-section" kicker="Experience" title="Where I've worked">
      {roles.map((role) => (
        <article id={role.id} key={role.id} tabIndex={-1} className="role">
          <div className="role-head">
            <div>
              <h3>{role.title}</h3>
              <div className="role-employer">{role.employerLine}</div>
            </div>
            <span className="role-dates">{role.dates}</span>
          </div>
          <ul>
            {role.bullets.map((bullet) => (
              <li key={bullet.id}>{bullet.text}</li>
            ))}
          </ul>
          <AskLink className="role-ask" topic={role.id}>
            Ask about this role
          </AskLink>
        </article>
      ))}
    </Section>
  );
}

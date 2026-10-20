import { knowledgeBase as defaultKb } from "../data/knowledgeBase";
import { skillGroups } from "../resume/pageModel";
import { EducationSection } from "./EducationSection";
import { Section } from "./Section";

/**
 * @param {{ knowledgeBase?: import("../resume/pageModel.js").KnowledgeBase }} [props]
 */
export function SkillsSection({ knowledgeBase = defaultKb } = {}) {
  const groups = skillGroups(knowledgeBase);
  return (
    <Section id="skills" kicker="Skills" title="What I work with">
      <div className="skill-rows">
        {groups.map((group) => (
          <div key={group.group} className="skill-row">
            <b>{group.group}</b>
            <span>{group.skills.join(", ")}</span>
          </div>
        ))}
      </div>
      <EducationSection knowledgeBase={knowledgeBase} />
    </Section>
  );
}

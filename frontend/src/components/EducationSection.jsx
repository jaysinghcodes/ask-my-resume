import { knowledgeBase as defaultKb } from "../data/knowledgeBase";
import { educationView } from "../resume/pageModel";

/**
 * @param {{ knowledgeBase?: import("../resume/pageModel.js").KnowledgeBase }} [props]
 */
export function EducationSection({ knowledgeBase = defaultKb } = {}) {
  const education = educationView(knowledgeBase);
  if (!education) return null;
  return (
    <div id={education.id} className="education-block">
      <p className="kicker">Education</p>
      <h3>{education.heading}</h3>
      <div className="education-detail">{education.detail}</div>
      <p className="education-activities">{education.activities}</p>
    </div>
  );
}

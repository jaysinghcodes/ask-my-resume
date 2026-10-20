import { knowledgeBase as defaultKb } from "../data/knowledgeBase";
import { ContactSection } from "./ContactSection";
import { ExperienceSection } from "./ExperienceSection";
import { ProjectsSection } from "./ProjectsSection";

/**
 * Experience, projects, skills, education, and contact.
 * The home page mounts these through HOME_SECTIONS, under Ask.
 * @param {{ knowledgeBase?: import("../resume/pageModel.js").KnowledgeBase }} [props]
 */
export function HomeResume({ knowledgeBase = defaultKb } = {}) {
  return (
    <>
      <ExperienceSection knowledgeBase={knowledgeBase} />
      <ProjectsSection knowledgeBase={knowledgeBase} />
      <ContactSection knowledgeBase={knowledgeBase} />
    </>
  );
}

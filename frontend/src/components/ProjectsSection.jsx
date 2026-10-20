import { knowledgeBase as defaultKb } from "../data/knowledgeBase";
import { projectCards } from "../resume/pageModel";
import { ProjectCard } from "./ProjectCard";
import { Section } from "./Section";
import { SkillsSection } from "./SkillsSection";

/**
 * Projects, then skills. Skills are not a nav tab.
 * @param {{ id?: string, knowledgeBase?: import("../resume/pageModel.js").KnowledgeBase }} [props]
 */
export function ProjectsSection({ id = "projects", knowledgeBase = defaultKb } = {}) {
  const projects = projectCards(knowledgeBase);
  return (
    <>
      <Section
        id={id}
        width="wide"
        className="projects-section"
        kicker="Projects"
        title="Things I've built"
        lede="AI products I designed, built and shipped on my own."
      >
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </Section>
      <SkillsSection knowledgeBase={knowledgeBase} />
    </>
  );
}

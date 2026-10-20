/**
 * Resume page view models. Facts come from the public knowledge base.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SKILL_GROUPS = ["Languages", "AI and data", "Cloud and frameworks"];

const CONTACT_LABELS = new Set(["Email", "LinkedIn", "GitHub", "Resume"]);

const REPO = "ask-my-resume";
const HOW_IT_WORKS = `https://github.com/jaysinghcodes/${REPO}/blob/main/README.md#how-it-works`;

/**
 * @typedef {Object} Metric
 * @property {string} label
 * @property {string | number} value
 */

/**
 * @typedef {Object} LinkItem
 * @property {string} label
 * @property {string} url
 * @property {string} [display]
 * @property {boolean} [public]
 */

/**
 * @typedef {Object} Bullet
 * @property {string} id
 * @property {string} role_id
 * @property {string} display_text
 * @property {boolean} show_on_page
 */

/**
 * @typedef {Object} Role
 * @property {string} id
 * @property {string} title
 * @property {string} employer
 * @property {string} [location]
 * @property {string} [start]
 * @property {string} [end]
 * @property {string[]} [bullet_ids]
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {boolean} [featured]
 * @property {LinkItem[]} [links]
 * @property {Metric[]} [metrics]
 * @property {boolean} [public]
 */

/**
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} group
 * @property {string} [name]
 * @property {string} [display_name]
 * @property {boolean} [on_resume]
 * @property {boolean} [public]
 */

/**
 * @typedef {Object} Education
 * @property {string} id
 * @property {string} [degree]
 * @property {string} [field]
 * @property {string} [school]
 * @property {string} [location]
 * @property {string} [end]
 * @property {string[]} [activities]
 */

/**
 * @typedef {Object} Profile
 * @property {string} [location]
 * @property {string} [work_preferences]
 * @property {string} [contact_blurb]
 * @property {LinkItem[]} [links]
 */

/**
 * @typedef {Object} KnowledgeBase
 * @property {Profile} [profile]
 * @property {Role[]} [roles]
 * @property {Bullet[]} [bullets]
 * @property {Project[]} [projects]
 * @property {Skill[]} [skills]
 * @property {Education[]} [education]
 */

/**
 * @typedef {Object} BulletView
 * @property {string} id
 * @property {string} text
 */

/**
 * @typedef {Object} RoleView
 * @property {string} id
 * @property {string} title
 * @property {string} employerLine
 * @property {string} dates
 * @property {BulletView[]} bullets
 */

/**
 * @typedef {Object} ProofPart
 * @property {string} text
 * @property {boolean} [strong]
 */

/**
 * @typedef {Object} ActionView
 * @property {string} label
 * @property {string} href
 * @property {string} [topic]
 * @property {boolean} accent
 * @property {boolean} external
 */

/**
 * @typedef {Object} ProjectView
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {string} summary
 * @property {string} stack
 * @property {string} image
 * @property {string} alt
 * @property {number} width
 * @property {number} height
 * @property {ProofPart[]} proof
 * @property {ActionView[]} actions
 */

/**
 * @typedef {Object} SkillGroupView
 * @property {string} group
 * @property {string[]} skills
 */

/**
 * @typedef {Object} EducationView
 * @property {string} id
 * @property {string} heading
 * @property {string} detail
 * @property {string} activities
 */

/**
 * @typedef {Object} ContactRow
 * @property {string} label
 * @property {string} href
 * @property {string} value
 * @property {boolean} copy
 * @property {boolean} external
 * @property {boolean} download
 */

/**
 * @typedef {Object} ContactView
 * @property {string} blurb
 * @property {ContactRow[]} rows
 * @property {string} email
 * @property {string} closing
 */

/**
 * @typedef {Object} ResumePage
 * @property {RoleView[]} experience
 * @property {ProjectView[]} projects
 * @property {SkillGroupView[]} skills
 * @property {EducationView | null} education
 * @property {ContactView} contact
 */

/**
 * @typedef {Object} ProjectFace
 * @property {string} tagline
 * @property {string} summary
 * @property {string[]} stack
 * @property {string} image
 * @property {string} alt
 * @property {number} width
 * @property {number} height
 * @property {string} [proof]
 * @property {string[]} [hideLinkLabels]
 */

/** @type {Record<string, ProjectFace>} */
const PROJECT_FACE = {
  "project-cleat": {
    tagline: "Trainer and client accountability app",
    summary:
      "Confidence gated AI replies over a RAG pipeline on each trainer's knowledge base, using pgvector with an HNSW cosine index.",
    stack: ["TypeScript", "Next.js", "React Native", "Supabase", "OpenAI"],
    image: "/projects/cleat.webp",
    alt: "Cleat trainer inbox",
    width: 1440,
    height: 960,
  },
  "project-mission-control": {
    tagline: "Control plane for an AI agent team",
    summary:
      "Self hosted observability for an OpenClaw agent team on Oracle Cloud: live runs, approvals, agent memory, model usage and spend.",
    stack: ["TypeScript", "NestJS", "Prisma", "PostgreSQL", "Socket.IO"],
    image: "/projects/mc.webp",
    alt: "Mission Control office view",
    width: 1440,
    height: 900,
  },
  "project-ask-my-resume": {
    tagline: "The assistant on this page",
    summary:
      "An agentic tool use loop where Claude searches my knowledge base until it can give a grounded answer with sources.",
    stack: ["React", "Node.js", "Claude API", "MCP", "Vercel"],
    image: "/projects/askjay.webp",
    alt: "Ask Jay chat",
    width: 1440,
    height: 778,
    proof: "Cited answers · streaming · rate limited",
    hideLinkLabels: ["Live demo"],
  },
};

const EDUCATION_ACTIVITIES = [
  "Secretary, Buckeye Bhangra",
  "Ambassador, Hack OHI/O",
  "Ambassador, Sikh Student Association (SSA)",
];

const EDUCATION_LINE =
  "Secretary, Buckeye Bhangra. Ambassador, Hack OHI/O and the Sikh Student Association.";

/**
 * @param {string | undefined} value
 * @returns {string}
 */
export function formatResumeDate(value) {
  if (!value || value === "present") return "present";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return value;
  return `${month} ${match[1]}`;
}

/**
 * @param {string | undefined} start
 * @param {string | undefined} end
 * @returns {string}
 */
export function formatDateRange(start, end) {
  const left = formatResumeDate(start);
  if (!end) return left;
  return `${left} to ${formatResumeDate(end)}`;
}

/**
 * @param {string[] | undefined} activities
 * @returns {string}
 */
export function formatActivities(activities) {
  const items = (activities || []).filter((item) => item.trim());
  const matchesEducation =
    items.length === EDUCATION_ACTIVITIES.length &&
    EDUCATION_ACTIVITIES.every((item, index) => items[index] === item);
  if (matchesEducation) return EDUCATION_LINE;
  if (items.length === 0) return "";
  const line = items.join(". ");
  return line.endsWith(".") ? line : `${line}.`;
}

/**
 * @param {KnowledgeBase} kb
 * @returns {RoleView[]}
 */
export function experienceRoles(kb) {
  const roles = [...(kb.roles || [])].sort((a, b) => {
    const left = a.start || "";
    const right = b.start || "";
    if (left === right) return 0;
    return left < right ? 1 : -1;
  });
  return roles.map((role) => ({
    id: role.id,
    title: role.title,
    employerLine: [role.employer, role.location].filter(Boolean).join(" · "),
    dates: formatDateRange(role.start, role.end),
    bullets: bulletsFor(role, kb),
  }));
}

/**
 * @param {Bullet | undefined} bullet
 * @returns {bullet is Bullet}
 */
function isPageBullet(bullet) {
  return Boolean(bullet && bullet.show_on_page);
}

/**
 * @param {Role} role
 * @param {KnowledgeBase} kb
 * @returns {BulletView[]}
 */
function bulletsFor(role, kb) {
  const byId = new Map((kb.bullets || []).map((bullet) => [bullet.id, bullet]));
  const ordered = (role.bullet_ids || []).map((id) => byId.get(id)).filter(isPageBullet);
  const seen = new Set(ordered.map((bullet) => bullet.id));
  const extras = (kb.bullets || []).filter(
    (bullet) => bullet.role_id === role.id && bullet.show_on_page && !seen.has(bullet.id),
  );
  return [...ordered, ...extras].map((bullet) => ({
    id: bullet.id,
    text: bullet.display_text,
  }));
}

/**
 * @param {KnowledgeBase} kb
 * @returns {ProjectView[]}
 */
export function projectCards(kb) {
  return (kb.projects || [])
    .filter((project) => project.featured && project.public !== false)
    .map((project) => {
      const face = PROJECT_FACE[project.id];
      if (!face) throw new Error(`Missing project card face for ${project.id}`);
      return {
        id: project.id,
        name: project.name,
        tagline: face.tagline,
        summary: face.summary,
        stack: face.stack.join(" · "),
        image: face.image,
        alt: face.alt,
        width: face.width,
        height: face.height,
        proof: proofFor(project, face),
        actions: actionsFor(project, face),
      };
    });
}

/**
 * @param {Project} project
 * @param {ProjectFace} face
 * @returns {ProofPart[]}
 */
function proofFor(project, face) {
  if (face.proof) return [{ text: face.proof }];
  if (project.id === "project-cleat") {
    return [
      { strong: true, text: metricNumber(project, "Labeled eval set") },
      { text: " message labeled eval set · " },
      { strong: true, text: metricValue(project, "Unit tests") },
      { text: " unit tests" },
    ];
  }
  if (project.id === "project-mission-control") {
    return [
      { strong: true, text: metricValue(project, "Test cases") },
      { text: " test cases across " },
      { strong: true, text: metricValue(project, "Test files") },
      { text: " test files" },
    ];
  }
  return [];
}

/**
 * @param {Project} project
 * @param {string} label
 * @returns {string}
 */
function metricValue(project, label) {
  const found = (project.metrics || []).find((item) => item.label === label);
  return found ? String(found.value) : "";
}

/**
 * @param {Project} project
 * @param {string} label
 * @returns {string}
 */
function metricNumber(project, label) {
  return metricValue(project, label).replace(/[^\d]/g, "");
}

/**
 * @param {Project} project
 * @param {ProjectFace} face
 * @returns {ActionView[]}
 */
function actionsFor(project, face) {
  const hidden = new Set(face.hideLinkLabels || []);
  /** @type {ActionView[]} */
  const actions = [];
  if (project.id === "project-ask-my-resume") {
    actions.push({
      label: "How it works",
      href: HOW_IT_WORKS,
      accent: true,
      external: true,
    });
  } else {
    actions.push({
      label: `Ask about ${project.name}`,
      href: "#ask",
      topic: project.id,
      accent: true,
      external: false,
    });
  }
  for (const link of project.links || []) {
    if (!link || link.public === false || hidden.has(link.label)) continue;
    actions.push({
      label: link.label,
      href: link.url,
      accent: false,
      external: /^https?:/i.test(link.url),
    });
  }
  return actions;
}

/**
 * @param {KnowledgeBase} kb
 * @returns {SkillGroupView[]}
 */
export function skillGroups(kb) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const skill of kb.skills || []) {
    if (skill.on_resume !== true || skill.public === false) continue;
    const name = skill.display_name || skill.name;
    if (!name || !skill.group) continue;
    const list = groups.get(skill.group) || [];
    list.push(name);
    groups.set(skill.group, list);
  }
  /** @type {SkillGroupView[]} */
  const ordered = [];
  for (const group of SKILL_GROUPS) {
    const skills = groups.get(group);
    if (skills && skills.length > 0) ordered.push({ group, skills });
  }
  for (const [group, skills] of groups) {
    if (!SKILL_GROUPS.includes(group) && skills.length > 0) ordered.push({ group, skills });
  }
  return ordered;
}

/**
 * @param {KnowledgeBase} kb
 * @returns {EducationView | null}
 */
export function educationView(kb) {
  const edu = (kb.education || [])[0];
  if (!edu) return null;
  const heading = [edu.degree, edu.field].filter(Boolean).join(" ");
  const detail = [edu.school, edu.location, edu.end ? `Class of ${edu.end}` : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    id: edu.id,
    heading,
    detail,
    activities: formatActivities(edu.activities),
  };
}

/**
 * @param {KnowledgeBase} kb
 * @returns {ContactView}
 */
export function contactView(kb) {
  const profile = kb.profile || {};
  const rows = (profile.links || [])
    .filter((link) => link && link.public !== false && CONTACT_LABELS.has(link.label))
    .map((link) => ({
      label: link.label,
      href: link.url,
      value: link.display || link.label,
      copy: link.label === "Email",
      external: /^https?:/i.test(link.url),
      download: link.label === "Resume",
    }));
  const email = rows.find((row) => row.label === "Email");
  const location = profile.location || "";
  const preferences = profile.work_preferences || "";
  const closing = [location ? `Based in ${location}` : "", preferences].filter(Boolean).join(" · ");
  return {
    blurb: profile.contact_blurb || "",
    rows,
    email: email?.value || "",
    closing,
  };
}

/**
 * @param {KnowledgeBase} kb
 * @returns {ResumePage}
 */
export function buildResumePage(kb) {
  return {
    experience: experienceRoles(kb),
    projects: projectCards(kb),
    skills: skillGroups(kb),
    education: educationView(kb),
    contact: contactView(kb),
  };
}

/**
 * Scoped question for a knowledge base id. T11 can replace the caller.
 * @param {string} topic
 * @param {KnowledgeBase} kb
 * @returns {string}
 */
export function questionForTopic(topic, kb) {
  const id = String(topic ?? "").trim();
  if (!id) return "";
  const role = (kb.roles || []).find((item) => item.id === id);
  if (role) return `Tell me about Jay's ${role.title} role at ${role.employer}.`;
  const project = (kb.projects || []).find((item) => item.id === id);
  if (project) return `Tell me about ${project.name}.`;
  if (/[.?!]$/.test(id)) return id;
  return `Tell me about ${id}.`;
}

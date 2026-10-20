/**
 * Nav links follow the home sections that are actually rendered.
 * Contact stays on /contact until a section with that id is in the list.
 * @param {{ id: string, label: string, order?: number }[]} sections
 * @returns {{ id: string, label: string, to: string, order: number }[]}
 */
export function navItems(sections) {
  const items = sections.map((section) => ({
    id: section.id,
    label: section.label,
    to: `/#${section.id}`,
    order: section.order ?? 0,
  }));

  if (!sections.some((section) => section.id === "contact")) {
    items.push({ id: "contact", label: "Contact", to: "/contact", order: 40 });
  }

  return items.sort((a, b) => a.order - b.order);
}

/**
 * @param {{ id: string }[]} sections
 */
export function contactSectionMounted(sections) {
  return sections.some((section) => section.id === "contact");
}

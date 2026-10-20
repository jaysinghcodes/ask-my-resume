declare module "virtual:kb" {
  export const builtAt: string;
  export const contact: {
    blurb: string;
    location: string;
    workPreferences: string;
    links: { label: string; url: string; display: string }[];
  };
}

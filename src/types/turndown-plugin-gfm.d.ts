// Minimal ambient declaration: turndown-plugin-gfm ships no TypeScript types.
// `gfm` is the combined plugin (tables + strikethrough + task lists + highlighted code);
// the individual plugins are exported too.
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  type Plugin = (service: TurndownService) => void;
  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
  export const highlightedCodeBlock: Plugin;
}

import { SapHelpSearchResult } from "./lib/types.js";

declare global {
  var sapHelpSearchCache: Map<string, SapHelpSearchResult> | undefined;
}

export {};
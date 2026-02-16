/**
 * Software Heroes module - exports for content search and ABAP Feature Matrix
 */

// Content search
export { searchSoftwareHeroesContent } from "./contentSearch.js";

// ABAP Feature Matrix
export {
  searchFeatureMatrix,
  getFeatureMatrixCacheStats,
  type SearchFeatureMatrixResult,
} from "./abapFeatureMatrix.js";

// Core utilities
export { decodeEntities, stripTags } from "./core.js";

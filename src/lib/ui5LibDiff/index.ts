/**
 * UI5 Version Diff module - exports the public API for the ui5_version_diff tool.
 */

export {
  getUi5VersionDiff,
  prefetchUi5LibDiff,
  getUi5LibDiffCacheStats,
  filterUi5Diff,
  compareUi5Versions,
  parseUi5Version,
  normalizeChangeType,
  type Ui5VersionDiffOptions,
  type Ui5VersionDiffResult,
  type Ui5ChangeEntry,
  type Ui5WhatsNewEntry,
  type Ui5ChangeType,
  type Ui5LibDiffLibrary,
} from "./ui5VersionDiff.js";

// Keep the FTS column order in sync with the positional weights in searchDb.ts.
export const FTS_SCHEMA = `
    CREATE VIRTUAL TABLE docs USING fts5(
      libraryId,                  -- indexed for filtering
      type,                       -- markdown/jsdoc/sample (indexed for filtering)
      title,                      -- strong signal for search
      description,                -- weaker signal for search
      keywords,                   -- control tags and properties
      controlName,                -- e.g., Wizard, Button
      namespace,                  -- e.g., sap.m, sap.f
      id UNINDEXED,               -- metadata (full path id)
      relFile UNINDEXED,          -- metadata
      snippetCount UNINDEXED      -- metadata
    );
`;

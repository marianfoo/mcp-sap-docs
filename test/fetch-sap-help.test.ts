/**
 * Tests that fetchLibraryDocumentation correctly dispatches
 * sap-help-* IDs to getSapHelpContent.
 *
 * getSapHelpContent is mocked to avoid network calls to help.sap.com.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sapHelp module before importing localDocs (vi.mock is auto-hoisted)
vi.mock("../src/lib/sapHelp.js", () => ({
  getSapHelpContent: vi.fn(),
  searchSapHelp: vi.fn(),
}));

import { fetchLibraryDocumentation } from "../src/lib/localDocs.js";
import { getSapHelpContent } from "../src/lib/sapHelp.js";

const mockedGetSapHelpContent = vi.mocked(getSapHelpContent);

describe("fetchLibraryDocumentation — SAP Help dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should route sap-help-* IDs to getSapHelpContent", async () => {
    const fakeContent = "# SAP Help Page\nSome documentation content.";
    mockedGetSapHelpContent.mockResolvedValue(fakeContent);

    const result = await fetchLibraryDocumentation("sap-help-3363506423");

    expect(mockedGetSapHelpContent).toHaveBeenCalledOnce();
    expect(mockedGetSapHelpContent).toHaveBeenCalledWith("sap-help-3363506423");
    expect(result).toBe(fakeContent);
  });

  it("should return the content from getSapHelpContent as-is", async () => {
    const markdown = "## Title\n\nParagraph with **bold** text.";
    mockedGetSapHelpContent.mockResolvedValue(markdown);

    const result = await fetchLibraryDocumentation("sap-help-abc123");

    expect(result).toBe(markdown);
  });

  it("should NOT call getSapHelpContent for non-sap-help IDs", async () => {
    // A local offline doc ID — will likely throw because the index
    // is unavailable, but the key assertion is that getSapHelpContent
    // is never called for IDs that don't start with 'sap-help-'.
    try {
      await fetchLibraryDocumentation("/abap-docs-standard/something");
    } catch {
      // Expected: local index lookup may fail in test environment
    }

    expect(mockedGetSapHelpContent).not.toHaveBeenCalled();
  });
});

/**
 * Tests that fetchLibraryDocumentation correctly dispatches
 * sap-help-* IDs to getSapHelpDocument.
 *
 * getSapHelpDocument is mocked to avoid network calls to help.sap.com.
 * It returns { text, citation } plus a truncation record when the document
 * had to be shortened; both travel on through fetchLibraryDocumentation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sapHelp module before importing localDocs (vi.mock is auto-hoisted)
vi.mock("../src/lib/sapHelp.js", () => ({
  getSapHelpDocument: vi.fn(),
  searchSapHelp: vi.fn(),
}));

import { fetchLibraryDocumentation } from "../src/lib/localDocs.js";
import { getSapHelpDocument } from "../src/lib/sapHelp.js";

const mockedGetSapHelpDocument = vi.mocked(getSapHelpDocument);

describe("fetchLibraryDocumentation — SAP Help dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should route sap-help-* IDs to getSapHelpDocument", async () => {
    const fakeContent = "# SAP Help Page\nSome documentation content.";
    mockedGetSapHelpDocument.mockResolvedValue({ text: fakeContent, citation: {} as never });

    const result = await fetchLibraryDocumentation("sap-help-3363506423");

    expect(mockedGetSapHelpDocument).toHaveBeenCalledOnce();
    expect(mockedGetSapHelpDocument).toHaveBeenCalledWith("sap-help-3363506423");
    expect(result?.text).toBe(fakeContent);
  });

  it("should return the content from getSapHelpDocument as-is", async () => {
    const markdown = "## Title\n\nParagraph with **bold** text.";
    mockedGetSapHelpDocument.mockResolvedValue({ text: markdown, citation: {} as never });

    const result = await fetchLibraryDocumentation("sap-help-abc123");

    expect(result?.text).toBe(markdown);
  });

  it("should carry the truncation record through to the caller", async () => {
    const truncation = {
      wasTruncated: true,
      originalLength: 90_000,
      truncatedLength: 74_000,
      omittedCharacters: 16_000,
    };
    mockedGetSapHelpDocument.mockResolvedValue({
      text: "…head and tail…",
      citation: {} as never,
      truncation,
    });

    const result = await fetchLibraryDocumentation("sap-help-truncated");

    expect(result?.truncation).toEqual(truncation);
  });

  it("should leave truncation absent when nothing was dropped", async () => {
    mockedGetSapHelpDocument.mockResolvedValue({
      text: "short document",
      citation: {} as never,
    });

    const result = await fetchLibraryDocumentation("sap-help-short");

    expect(result?.truncation).toBeUndefined();
  });

  it("should NOT call getSapHelpDocument for non-sap-help IDs", async () => {
    // A local offline doc ID — will likely throw because the index
    // is unavailable, but the key assertion is that getSapHelpDocument
    // is never called for IDs that don't start with 'sap-help-'.
    try {
      await fetchLibraryDocumentation("/abap-docs-standard/something");
    } catch {
      // Expected: local index lookup may fail in test environment
    }

    expect(mockedGetSapHelpDocument).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { truncateContent, truncateContentSimple } from "../src/lib/truncate.js";

// Pure-function tests — no network.
//
// truncate.ts had no coverage at all. The cases below pin the behaviour that
// callers depend on (beginning and end are preserved, the notice is present,
// the reported lengths are consistent) so that changing the truncation budget
// cannot silently alter the contract.

/** Build a document with n paragraphs of roughly `size` characters each. */
function document(paragraphs: number, size = 200): string {
  return Array.from({ length: paragraphs }, (_, i) =>
    `Paragraph ${i} ` + "x".repeat(size)
  ).join("\n\n");
}

describe("truncateContent", () => {
  it("returns content unchanged below the limit", () => {
    const content = document(5, 100);
    const result = truncateContent(content, 10_000);

    expect(result.wasTruncated).toBe(false);
    expect(result.content).toBe(content);
    expect(result.originalLength).toBe(content.length);
    expect(result.truncatedLength).toBe(content.length);
  });

  it("keeps the beginning and the end and drops the middle", () => {
    const content = document(200, 100); // ~40,000 characters
    const result = truncateContent(content, 5_000);

    expect(result.wasTruncated).toBe(true);
    expect(result.content.startsWith("Paragraph 0")).toBe(true);
    expect(result.content).toContain("Paragraph 199");
    expect(result.content).toMatch(/⚠️ \*\*Content Truncated\*\*/);
  });

  it("reports lengths consistent with what it actually kept", () => {
    const content = document(200, 100);
    const result = truncateContent(content, 5_000);

    expect(result.originalLength).toBe(content.length);
    expect(result.truncatedLength).toBe(result.content.length);

    // The notice has a fixed shape, so its length can be measured exactly. The
    // number it reports has to equal what was really dropped — otherwise a
    // consumer cannot tell how much of the document it is holding.
    const notice = result.content.match(/\n\n---\n\n⚠️ \*\*Content Truncated\*\*[\s\S]*?\n---\n\n/);
    expect(notice).not.toBeNull();

    // toLocaleString() without an explicit locale groups digits with "." on a
    // German host and with "," on an English one, so the parser has to accept
    // both. Reading only [\d,] would silently parse "19.108" as "108".
    const reported = result.content.match(/([\d.,]+) characters \(\d+%\)/)![1];
    const omitted = Number(reported.replace(/[.,]/g, ""));
    const kept = result.truncatedLength - notice![0].length;

    expect(omitted).toBe(result.originalLength - kept);
  });

  it("cuts at a paragraph boundary instead of mid-word", () => {
    const content = document(200, 100);
    const result = truncateContent(content, 5_000);
    const head = result.content.split("\n\n---\n\n⚠️")[0];

    // The head ends on a whole paragraph, not inside one.
    expect(head).toMatch(/Paragraph \d+ x{100}\n\n$/);
  });

  it("can exceed maxLength by the length of the notice", () => {
    // Characterising a real defect: 60% + 20% plus the notice overshoots the
    // limit for small budgets, and the reserved 20% is never used. For
    // maxLength = 1000 the result is 1090 characters.
    const content = "y".repeat(50_000);
    const result = truncateContent(content, 1_000);

    expect(result.wasTruncated).toBe(true);
    expect(result.content).toContain("Content Truncated");
    expect(result.truncatedLength).toBeGreaterThan(1_000);
    expect(result.truncatedLength).toBeLessThan(1_500);
  });

  it("stays within maxLength when the budget is large enough", () => {
    const content = document(200, 100);
    const result = truncateContent(content, 5_000);

    expect(result.truncatedLength).toBeLessThanOrEqual(5_000);
  });

  it("uses only part of the budget today — characterising the current contract", () => {
    // 60% from the start plus 20% from the end, and the remaining 20% stays
    // unused. A post can therefore lose far more than maxLength implies.
    const content = document(200, 100);
    const result = truncateContent(content, 10_000);

    expect(result.truncatedLength).toBeLessThan(9_000);
    expect(result.truncatedLength).toBeGreaterThan(7_500);
  });

  it("honours an explicit maxLength argument", () => {
    const content = document(200, 100);
    const tight = truncateContent(content, 2_000);
    const loose = truncateContent(content, 8_000);

    expect(tight.truncatedLength).toBeLessThan(loose.truncatedLength);
    expect(tight.wasTruncated).toBe(true);
    expect(loose.wasTruncated).toBe(true);
  });

  it("handles a content without any natural break", () => {
    const content = "y".repeat(50_000);
    const result = truncateContent(content, 1_000);

    expect(result.wasTruncated).toBe(true);
    expect(result.content).toContain("Content Truncated");
    expect(result.originalLength).toBe(50_000);
  });

  it("does not truncate at exactly the limit", () => {
    const content = document(10, 100);
    const result = truncateContent(content, content.length);

    expect(result.wasTruncated).toBe(false);
    expect(result.content).toBe(content);
  });
});

describe("truncateContentSimple", () => {
  it("keeps the beginning and reports the loss", () => {
    const content = document(200, 100);
    const result = truncateContentSimple(content, 5_000);

    expect(result.wasTruncated).toBe(true);
    expect(result.content.startsWith("Paragraph 0")).toBe(true);
    expect(result.content).toContain("Content Truncated");
    expect(result.truncatedLength).toBeLessThanOrEqual(5_000);
  });

  it("returns content unchanged below the limit", () => {
    const content = document(2, 50);
    const result = truncateContentSimple(content, 10_000);

    expect(result.wasTruncated).toBe(false);
    expect(result.content).toBe(content);
  });
});
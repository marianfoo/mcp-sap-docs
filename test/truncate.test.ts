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
    const content = document(200, 100);
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

    // Prose uses locale-independent integers; metadata is the client contract.
    const reported = result.content.match(/(\d+) of (\d+) characters/)!;
    const omitted = Number(reported[1]);
    expect(Number(reported[2])).toBe(content.length);
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

  it("never exceeds maxLength, even without a natural break", () => {
    // 60% + 20% plus the notice used to overshoot: maxLength = 1000 returned
    // 1090 characters.
    const content = "y".repeat(50_000);
    const result = truncateContent(content, 1_000);

    expect(result.wasTruncated).toBe(true);
    expect(result.content).toContain("Content Truncated");
    expect(result.truncatedLength).toBeLessThanOrEqual(1_000);
  });

  it("uses the whole budget instead of leaving 20% untouched", () => {
    // Before this change the head got 60% and the tail 20%; the remaining 20%
    // was reserved for a ~300 character notice and never used.
    const content = document(200, 100);
    const result = truncateContent(content, 10_000);

    expect(result.truncatedLength).toBeGreaterThan(9_000);
    expect(result.truncatedLength).toBeLessThanOrEqual(10_000);
  });

  it("honours an explicit maxLength argument", () => {
    const content = document(200, 100);
    const tight = truncateContent(content, 2_000);
    const loose = truncateContent(content, 8_000);

    expect(tight.truncatedLength).toBeLessThan(loose.truncatedLength);
    expect(tight.wasTruncated).toBe(true);
    expect(loose.wasTruncated).toBe(true);
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

describe.each([
  ["head and tail", truncateContent],
  ["head only", truncateContentSimple],
] as const)("%s budget and accounting", (_name, truncate) => {
  it("honours every small positive budget, including the notice", () => {
    for (const content of ["x".repeat(10_000), "\n# Heading\n" + "x".repeat(10_000)]) {
      for (let limit = 1; limit <= 500; limit++) {
        const result = truncate(content, limit);
        expect(result.content.length, `limit ${limit}`).toBeLessThanOrEqual(limit);
        expect(result.truncatedLength).toBe(result.content.length);
        expect(result.omittedCharacters).toBeGreaterThan(0);
        if (content.startsWith("x")) {
          expect((result.content.match(/x/g) || []).length + result.omittedCharacters).toBe(content.length);
        }
      }
    }
  });

  it("does not split a Unicode surrogate pair at either cut", () => {
    for (let limit = 1; limit <= 600; limit++) {
      const result = truncate("😀".repeat(1_000), limit);
      expect(result.content).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
    }
  });

  it("rejects invalid explicit limits", () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => truncate("text", limit)).toThrow(RangeError);
    }
  });
});

describe("truncation boundaries", () => {
  it("keeps a tail cut already at a paragraph start", () => {
    const content = "x".repeat(9826) + "\n\nOne. " + "y".repeat(167);
    const tail = truncateContent(content, 1000).content.split("\n---\n\n").at(-1)!;
    expect(tail).toBe("One. " + "y".repeat(167));
  });

  it("keeps a head cut already at a line end", () => {
    const content = "x".repeat(650) + ". " + "y".repeat(40) + "\n" + "z".repeat(9307);
    const head = truncateContent(content, 1000).content.split("\n\n---\n\n")[0];
    expect(head).toBe(content.slice(0, 692));
  });

  it("starts the tail at a nearby paragraph instead of in its first word", () => {
    const content = Array.from({length: 200}, (_, i) => `Paragraph ${i} ` + "x".repeat(100)).join("\n\n");
    const result = truncateContent(content, 5_000);
    const tail = result.content.split("\n---\n\n").at(-1)!;
    expect(tail).toMatch(/^Paragraph \d+ /);
    expect(result.omittedCharacters).toBe(content.length - (result.content.split("\n\n---\n\n")[0].length + tail.length));
  });

  it("keeps almost all the budget when paragraphs are very long", () => {
    const content = ("x".repeat(12_000) + "\n\n").repeat(10);
    const result = truncateContent(content, 75_000);
    expect(result.truncatedLength).toBeGreaterThan(74_500);
  });

  it("does not leave a partial nearby heading at the end of the head", () => {
    const heading = "## " + "Heading".repeat(10);
    const content = "x".repeat(300) + "\n" + heading + "\n" + "y".repeat(3_000);
    for (let limit = 500; limit < 900; limit++) {
      const head = truncateContent(content, limit).content.split("\n\n---\n\n")[0];
      if (head.includes("##")) expect(head).toContain(heading);
    }
  });
});

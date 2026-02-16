/**
 * Tests for Software Heroes Content Search HTML parsing
 * These tests use a fixture HTML file and do NOT make network calls.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseSoftwareHeroesSearchHtml,
  ParsedSearchHit,
} from "../dist/src/lib/softwareHeroes/contentSearch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Software Heroes Content Search Parsing", () => {
  let fixtureHtml: string;
  let parsedResults: ParsedSearchHit[];

  beforeAll(() => {
    // Load the fixture HTML (simulates the screen[].content from START_SEARCH)
    const fixturePath = path.join(
      __dirname,
      "fixtures",
      "software-heroes-search-sample.html"
    );
    fixtureHtml = fs.readFileSync(fixturePath, "utf-8");
    parsedResults = parseSoftwareHeroesSearchHtml(fixtureHtml);
  });

  describe("parseSoftwareHeroesSearchHtml", () => {
    it("should parse all card results", () => {
      expect(parsedResults.length).toBe(6);
    });

    it("should extract titles correctly", () => {
      const titles = parsedResults.map((r) => r.title);
      expect(titles).toContain("RAP Business Object Tutorial - Part 1");
      expect(titles).toContain("News: New ABAP Cloud Features 2024");
      expect(titles).toContain("ABAP SQL Expressions Example");
      expect(titles).toContain("ABAP Feature Matrix");
    });

    it("should extract snippets correctly", () => {
      const firstResult = parsedResults.find((r) =>
        r.title.includes("RAP Business Object")
      );
      expect(firstResult?.snippet).toContain(
        "Learn how to create a basic RAP Business Object"
      );
      expect(firstResult?.snippet).toContain("managed implementation");
    });

    it("should decode HTML entities in titles", () => {
      // The fixture has "CDS &amp; Annotations" which should be decoded
      const cdsResult = parsedResults.find((r) =>
        r.title.includes("Annotations")
      );
      expect(cdsResult?.title).toBe("CDS & Annotations Deep Dive");
    });

    it("should decode HTML entities in snippets", () => {
      // The fixture has "&amp;" in the snippet
      const cdsResult = parsedResults.find((r) =>
        r.title.includes("Annotations")
      );
      expect(cdsResult?.snippet).toContain("patterns & best practices");
    });

    it("should convert relative URLs to absolute URLs", () => {
      const rapResult = parsedResults.find((r) =>
        r.title.includes("RAP Business Object")
      );
      expect(rapResult?.url).toBe(
        "https://software-heroes.com/en/blog/rap-business-object-tutorial-part-1"
      );
    });

    it("should preserve already absolute URLs", () => {
      const matrixResult = parsedResults.find((r) =>
        r.title.includes("Feature Matrix")
      );
      expect(matrixResult?.url).toBe(
        "https://software-heroes.com/en/abap-feature-matrix"
      );
    });

    it("should derive kind from icon class - article (school)", () => {
      const rapResult = parsedResults.find((r) =>
        r.title.includes("RAP Business Object")
      );
      expect(rapResult?.kind).toBe("article");
    });

    it("should derive kind from icon class - feed (rss_feed)", () => {
      const newsResult = parsedResults.find((r) =>
        r.title.includes("ABAP Cloud Features")
      );
      expect(newsResult?.kind).toBe("feed");
    });

    it("should derive kind from icon class - code", () => {
      const codeResult = parsedResults.find((r) =>
        r.title.includes("SQL Expressions")
      );
      expect(codeResult?.kind).toBe("code");
    });

    it("should derive kind from icon class - page (insert_drive_file)", () => {
      const pageResult = parsedResults.find((r) =>
        r.title.includes("Feature Matrix")
      );
      expect(pageResult?.kind).toBe("page");
    });

    it("should handle German article URLs", () => {
      const cdsResult = parsedResults.find((r) => r.title.includes("CDS &"));
      expect(cdsResult?.url).toBe(
        "https://software-heroes.com/de/blog/cds-annotations-deep-dive"
      );
    });
  });

  describe("Edge cases", () => {
    it("should return empty array for empty HTML", () => {
      const results = parseSoftwareHeroesSearchHtml("");
      expect(results).toEqual([]);
    });

    it("should return empty array for null/undefined", () => {
      const results = parseSoftwareHeroesSearchHtml(null as any);
      expect(results).toEqual([]);
    });

    it("should handle HTML with no cards", () => {
      const html = "<div>No search results found</div>";
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results).toEqual([]);
    });

    it("should skip cards without titles", () => {
      const html = `
        <div class="cls_app_card">
          <p>Some content without title</p>
          <div class="cls_app_buttons">
            <a href="/some/link">Click</a>
          </div>
        </div>
        <div class="cls_app_card">
          <h4>Valid Card</h4>
          <p>This one has a title</p>
          <div class="cls_app_buttons">
            <a href="/valid/link">Click</a>
          </div>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Valid Card");
    });

    it("should handle cards without snippets", () => {
      const html = `
        <div class="cls_app_card">
          <h4>Title Only Card</h4>
          <div class="cls_app_buttons">
            <a href="/some/link">Click</a>
          </div>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Title Only Card");
      expect(results[0].snippet).toBe("");
    });

    it("should handle cards without URLs (fallback)", () => {
      const html = `
        <div class="cls_app_card">
          <a href="/fallback/url">Fallback Link</a>
          <h4>Card With Fallback URL</h4>
          <p>This card has a link but not in buttons section</p>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe("https://software-heroes.com/fallback/url");
    });

    it("should handle malformed HTML gracefully", () => {
      const html = `
        <div class="cls_app_card">
          <h4>Unclosed Title
          <p>Snippet text
          <div class="cls_app_buttons">
            <a href="/link">Link
        </div>
      `;
      // Should not throw, may have partial or empty results
      expect(() => parseSoftwareHeroesSearchHtml(html)).not.toThrow();
    });

    it("should handle special characters in URLs", () => {
      const html = `
        <div class="cls_app_card">
          <h4>Special URL Card</h4>
          <p>Description</p>
          <div class="cls_app_buttons">
            <a href="/en/blog/what&apos;s-new-2024">Read</a>
          </div>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results.length).toBe(1);
      // The apostrophe entity should be decoded
      expect(results[0].url).toBe(
        "https://software-heroes.com/en/blog/what's-new-2024"
      );
    });
  });

  describe("Whitespace handling", () => {
    it("should normalize whitespace in titles", () => {
      const html = `
        <div class="cls_app_card">
          <h4>  Multiple   Spaces   Here  </h4>
          <p>Content</p>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results[0].title).toBe("Multiple Spaces Here");
    });

    it("should normalize whitespace in snippets", () => {
      const html = `
        <div class="cls_app_card">
          <h4>Title</h4>
          <p>
            Line 1
            Line 2
            Line 3
          </p>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results[0].snippet).toBe("Line 1 Line 2 Line 3");
    });

    it("should strip inline HTML from titles", () => {
      const html = `
        <div class="cls_app_card">
          <h4><strong>Bold</strong> and <em>italic</em> title</h4>
          <p>Content</p>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results[0].title).toBe("Bold and italic title");
    });
  });

  describe("URL path derivation for kind", () => {
    it("should derive article kind from /blog/ URL path", () => {
      const html = `
        <div class="cls_app_card">
          <div class="cls_icon cls_app_icon">unknown_icon</div>
          <h4>Blog Post</h4>
          <p>Content</p>
          <div class="cls_app_buttons">
            <a href="/en/blog/some-article">Read</a>
          </div>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results[0].kind).toBe("article");
    });

    it("should derive feed kind from /feed URL path", () => {
      const html = `
        <div class="cls_app_card">
          <div class="cls_icon cls_app_icon">unknown</div>
          <h4>Feed Item</h4>
          <p>Content</p>
          <div class="cls_app_buttons">
            <a href="/en/feed/news-item">View</a>
          </div>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results[0].kind).toBe("feed");
    });

    it("should default to article kind when no indicators found", () => {
      const html = `
        <div class="cls_app_card">
          <div class="cls_icon cls_app_icon">mystery</div>
          <h4>Unknown Type</h4>
          <p>Content</p>
          <div class="cls_app_buttons">
            <a href="/en/page/something">View</a>
          </div>
        </div>
      `;
      const results = parseSoftwareHeroesSearchHtml(html);
      expect(results[0].kind).toBe("article");
    });
  });
});

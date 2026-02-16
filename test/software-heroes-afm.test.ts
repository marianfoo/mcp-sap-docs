/**
 * Tests for Software Heroes ABAP Feature Matrix parsing and search
 * These tests use a fixture HTML file and do NOT make network calls.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseAbapFeatureMatrix,
  searchAbapFeatureMatrix,
  ParsedFeatureMatrix,
  FeatureMatch,
} from '../dist/src/lib/softwareHeroes/abapFeatureMatrix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ABAP Feature Matrix Parsing', () => {
  let fixtureHtml: string;
  let parsedMatrix: ParsedFeatureMatrix;

  beforeAll(() => {
    // Load the fixture HTML
    const fixturePath = path.join(__dirname, 'fixtures', 'abap-feature-matrix-sample.html');
    fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
    parsedMatrix = parseAbapFeatureMatrix(fixtureHtml);
  });

  describe('parseAbapFeatureMatrix', () => {
    it('should parse the legend correctly', () => {
      expect(parsedMatrix.legend).toBeDefined();
      expect(Object.keys(parsedMatrix.legend).length).toBeGreaterThan(0);
      
      // Check for expected legend entries
      expect(parsedMatrix.legend['✅']).toBe('Available');
      expect(parsedMatrix.legend['❌']).toBe('Not available');
      expect(parsedMatrix.legend['⭕']).toBe('Deprecated');
      expect(parsedMatrix.legend['❔']).toBe('Needs review');
      expect(parsedMatrix.legend['🔽']).toBe('Downport');
    });

    it('should parse navigation sections', () => {
      expect(parsedMatrix.sections).toBeDefined();
      expect(parsedMatrix.sections.length).toBeGreaterThan(0);
      
      // Check for expected sections
      expect(parsedMatrix.sections).toContain('ABAP SQL');
      expect(parsedMatrix.sections).toContain('ABAP Statements');
      expect(parsedMatrix.sections).toContain('Core Data Services');
    });

    it('should parse tables correctly', () => {
      expect(parsedMatrix.tables).toBeDefined();
      expect(parsedMatrix.tables.length).toBe(3);
    });

    it('should parse table headers', () => {
      const abapSqlTable = parsedMatrix.tables[0];
      expect(abapSqlTable.headers).toBeDefined();
      expect(abapSqlTable.headers).toContain('Feature');
      expect(abapSqlTable.headers).toContain('7.40');
      expect(abapSqlTable.headers).toContain('LATEST');
    });

    it('should parse feature rows', () => {
      const abapSqlTable = parsedMatrix.tables[0];
      expect(abapSqlTable.rows.length).toBeGreaterThan(0);
      
      // Check first row
      const firstRow = abapSqlTable.rows[0];
      expect(firstRow.feature).toBe('Inline Declarations in SELECT');
      expect(firstRow.link).toBe('https://help.sap.com/doc/abapdocu/inline');
    });

    it('should parse status correctly', () => {
      const abapSqlTable = parsedMatrix.tables[0];
      const inlineDeclarationRow = abapSqlTable.rows[0];
      
      // Inline declarations: not available in 7.40, available from 7.50
      expect(inlineDeclarationRow.statusByRelease['7.40']).toBe('unavailable');
      expect(inlineDeclarationRow.statusByRelease['7.50']).toBe('available');
      expect(inlineDeclarationRow.statusByRelease['LATEST']).toBe('available');
    });

    it('should handle rows without links', () => {
      const abapSqlTable = parsedMatrix.tables[0];
      const selectIntoRow = abapSqlTable.rows.find(r => r.feature === 'SELECT INTO @DATA');
      expect(selectIntoRow).toBeDefined();
      expect(selectIntoRow?.link).toBeUndefined();
    });
  });

  describe('searchAbapFeatureMatrix', () => {
    it('should find exact matches', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'inline declaration', 10);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].feature.toLowerCase()).toContain('inline');
    });

    it('should return matches sorted by score', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'CDS', 10);
      expect(matches.length).toBeGreaterThan(0);
      
      // Verify scores are descending
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].score).toBeLessThanOrEqual(matches[i - 1].score);
      }
    });

    it('should respect limit parameter', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'a', 3);
      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for no matches', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'xyznonexistent123', 10);
      expect(matches.length).toBe(0);
    });

    it('should include section name in results', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'CDS Views', 5);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].section).toBe('Core Data Services');
    });

    it('should include statusByRelease in results', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'CORRESPONDING', 5);
      expect(matches.length).toBeGreaterThan(0);
      
      const match = matches[0];
      expect(match.statusByRelease).toBeDefined();
      expect(typeof match.statusByRelease['7.40']).toBe('string');
    });

    it('should match features containing search terms', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'constructor', 10);
      expect(matches.length).toBeGreaterThan(0);
      
      // Should find NEW constructor, VALUE constructor, CORRESPONDING constructor
      const features = matches.map(m => m.feature.toLowerCase());
      expect(features.some(f => f.includes('constructor'))).toBe(true);
    });

    it('should boost section matches', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'SQL SELECT', 10);
      expect(matches.length).toBeGreaterThan(0);
      
      // Features from ABAP SQL section should be boosted
      const sqlSectionMatches = matches.filter(m => m.section === 'ABAP SQL');
      expect(sqlSectionMatches.length).toBeGreaterThan(0);
    });

    it('should handle single character queries gracefully', () => {
      // Single character queries should be filtered out (minLength = 2)
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'a', 10);
      // Should still work but may return many results
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should return all features for empty query', () => {
      // Empty query now returns all features (up to limit)
      const matches = searchAbapFeatureMatrix(parsedMatrix, '', 10);
      expect(matches.length).toBe(10);
      
      // All results should have score 1 (base score for "all features" mode)
      expect(matches.every(m => m.score === 1)).toBe(true);
    });
  });

  describe('Feature availability checks', () => {
    it('should correctly identify features available from 7.40', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'NEW constructor', 5);
      expect(matches.length).toBeGreaterThan(0);
      
      const match = matches.find(m => m.feature.includes('NEW'));
      expect(match).toBeDefined();
      expect(match?.statusByRelease['7.40']).toBe('available');
    });

    it('should correctly identify features introduced in 7.50', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'CORRESPONDING constructor', 5);
      expect(matches.length).toBeGreaterThan(0);
      
      const match = matches.find(m => m.feature.includes('CORRESPONDING'));
      expect(match).toBeDefined();
      expect(match?.statusByRelease['7.40']).toBe('unavailable');
      expect(match?.statusByRelease['7.50']).toBe('available');
    });

    it('should correctly identify features introduced in 7.54', () => {
      const matches = searchAbapFeatureMatrix(parsedMatrix, 'CDS View Entity', 5);
      expect(matches.length).toBeGreaterThan(0);
      
      const match = matches.find(m => m.feature.includes('View Entity'));
      expect(match).toBeDefined();
      expect(match?.statusByRelease['7.52']).toBe('unavailable');
      expect(match?.statusByRelease['7.54']).toBe('available');
    });
  });
});

describe('Edge cases', () => {
  it('should handle empty HTML', () => {
    const result = parseAbapFeatureMatrix('');
    expect(result.tables.length).toBe(0);
    expect(result.sections.length).toBe(0);
  });

  it('should handle HTML without tables', () => {
    const html = '<div>No tables here</div>';
    const result = parseAbapFeatureMatrix(html);
    expect(result.tables.length).toBe(0);
  });

  it('should handle malformed HTML gracefully', () => {
    const html = '<table><tr><td>Incomplete table';
    const result = parseAbapFeatureMatrix(html);
    // Should not throw, may have empty or partial results
    expect(result).toBeDefined();
  });
});

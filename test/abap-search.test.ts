import { describe, it, expect, beforeAll } from 'vitest';
import { searchAbapDocs, getAbapDoc } from '../src/lib/abapDocs.js';

describe('ABAP Keyword Documentation Search', () => {
  beforeAll(async () => {
    // Ensure we have a clean test environment
    console.log('🔧 Setting up ABAP search tests...');
  });

  describe('Individual Files First Strategy', () => {
    it('should return abeninline_declarations.md for "Inline Declarations" query', async () => {
      const result = await searchAbapDocs('Inline Declarations', '7.58', 5);
      
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      
      // Find the target file in results
      const targetFile = result.results.find(r => 
        r.file?.includes('abeninline_declarations.md') || 
        r.title?.toLowerCase().includes('inline declarations')
      );
      
      expect(targetFile).toBeDefined();
      expect(targetFile?.file).toMatch(/abeninline_declarations\.md$/);
      expect(targetFile?.type).toBe('individual');
      expect(targetFile?.title).toMatch(/inline.*declarations/i);
    }, 15000);

    it('should prioritize individual files over bundles', async () => {
      const result = await searchAbapDocs('SELECT statements', '7.58', 10);
      
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      
      // First few results should be individual files, not mega-bundles
      const topResults = result.results.slice(0, 3);
      const individualFileResults = topResults.filter(r => r.type === 'individual');
      const megaBundleResults = topResults.filter(r => r.type === 'mega-bundle');
      
      // Should have more individual files than mega bundles in top results
      expect(individualFileResults.length).toBeGreaterThanOrEqual(megaBundleResults.length);
      
      // Individual files should have reasonable sizes (formatted as string)
      individualFileResults.forEach(result => {
        expect(result.size).toBeDefined();
        expect(typeof result.size).toBe('string');
        // Should not be massive files like "3MB" or "4MB"
        expect(result.size).not.toMatch(/\d+MB/);
      });
    }, 15000);

    it('should return files with proper metadata and scoring', async () => {
      const result = await searchAbapDocs('LOOP statements', '7.58', 5);
      
      expect(result.results).toBeDefined();
      
      result.results.forEach(searchResult => {
        // Each result should have required fields
        expect(searchResult.id).toBeDefined();
        expect(searchResult.title).toBeDefined();
        expect(searchResult.score).toBeGreaterThan(0);
        expect(searchResult.type).toBeDefined();
        
        // Individual files should have size and file information
        if (searchResult.type === 'individual') {
          expect(searchResult.size).toBeDefined();
          expect(searchResult.file).toBeDefined();
          expect(searchResult.category).toBeDefined();
        }
      });
    }, 10000);
  });

  describe('Document Retrieval', () => {
    it('should retrieve individual file content with source attribution', async () => {
      // First search for the document
      const searchResult = await searchAbapDocs('Inline Declarations', '7.58', 3);
      const targetFile = searchResult.results.find(r => 
        r.file?.includes('abeninline_declarations.md')
      );
      
      expect(targetFile).toBeDefined();
      
      // Then retrieve the full content
      const doc = await getAbapDoc(targetFile!.id, '7.58');
      
      expect(doc).toBeDefined();
      expect(typeof doc).toBe('string');
      expect(doc.length).toBeGreaterThan(0);
      
      // Should include source attribution
      expect(doc).toMatch(/📖 Official.*Source/);
      expect(doc).toMatch(/help\.sap\.com/);
      
      // Should be optimally sized for LLM (not too large)
      expect(doc.length).toBeLessThan(20000); // Individual files should be small
    }, 10000);

    it('should handle different content types appropriately', async () => {
      const testQueries = [
        { query: 'exception handling', expectedType: 'individual' },
        { query: 'class definitions', expectedType: 'individual' },
        { query: 'data types', expectedType: 'individual' }
      ];

      for (const testCase of testQueries) {
        const result = await searchAbapDocs(testCase.query, '7.58', 3);
        
        expect(result.results).toBeDefined();
        expect(result.results.length).toBeGreaterThan(0);
        
        // Should prioritize individual files
        const topResult = result.results[0];
        expect(topResult.type).toBe(testCase.expectedType);
        
        if (topResult.type === 'individual') {
          expect(typeof topResult.size).toBe('string'); // Size is formatted string
          expect(topResult.size).not.toMatch(/\d+MB/); // Should not be massive
        }
      }
    }, 20000);
  });

  describe('Search Quality and Relevance', () => {
    it('should return relevant results with proper scoring', async () => {
      const result = await searchAbapDocs('DATA declaration', '7.58', 5);
      
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      
      // Results should be sorted by score (descending)
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i-1].score).toBeGreaterThanOrEqual(result.results[i].score);
      }
      
      // Top result should have high relevance score
      expect(result.results[0].score).toBeGreaterThan(10);
    }, 10000);

    it('should handle edge cases gracefully', async () => {
      const edgeCases = [
        'nonexistent_abap_keyword_xyz',
        '',
        'a', // Single character
        'very long query with many words that probably do not exist in documentation'
      ];

      for (const query of edgeCases) {
        const result = await searchAbapDocs(query, '7.58', 3);
        
        expect(result.results).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
        
        // Should handle gracefully without errors
        if (result.results.length > 0) {
          // If results exist, they should be valid
          expect(result.results[0].score).toBeGreaterThan(0);
        }
      }
    }, 15000);

    it('should support different ABAP versions', async () => {
      const versions = ['7.58', '7.57', '7.56'];
      
      for (const version of versions) {
        const result = await searchAbapDocs('DATA statements', version, 2);
        
        expect(result.results).toBeDefined();
        
        if (result.results.length > 0) {
          // Should return results for the specified version
          expect(result.version).toBe(version);
          
          // Results should have version-specific information
          const firstResult = result.results[0];
          expect(firstResult.id).toContain(version);
        }
      }
    }, 15000);
  });

  describe('Content Quality and LLM Optimization', () => {
    it('should return properly formatted content for LLM consumption', async () => {
      const result = await searchAbapDocs('CLASS definition', '7.58', 3);
      
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      
      const individualFile = result.results.find(r => r.type === 'individual-file');
      
      if (individualFile) {
        const doc = await getAbapDoc(individualFile.id, '7.58');
        
        // Should have clear structure
        expect(doc).toMatch(/^# /m); // Should have proper title
        expect(doc).toMatch(/📖 Official.*Source/); // Should have source attribution
        
        // Should be well-formatted for LLM
        expect(doc).not.toMatch(/javascript:call_link/); // No broken JS links
        expect(doc).toMatch(/https?:\/\//); // Should have proper URLs
      }
    }, 10000);

    it('should provide size-appropriate content', async () => {
      const result = await searchAbapDocs('variable declaration', '7.58', 5);
      
      expect(result.results).toBeDefined();
      
      result.results.forEach(searchResult => {
        if (searchResult.type === 'individual') {
          // Individual files should be optimally sized for LLM context windows
          expect(searchResult.size).toBeDefined();
          expect(typeof searchResult.size).toBe('string'); // Size is formatted string like "3KB"
          expect(searchResult.size).not.toMatch(/\d+MB/); // Should not be massive files
        }
      });
    }, 10000);
  });

  describe('Error Handling and Robustness', () => {
    it('should handle invalid version gracefully', async () => {
      // Should throw an error for invalid version, which is the expected behavior
      await expect(async () => {
        await searchAbapDocs('DATA statements', '9.99', 3);
      }).rejects.toThrow(/Neither enhanced nor regular bundles index found/);
    }, 10000);

    it('should handle document retrieval errors gracefully', async () => {
      // Try to get a non-existent document - should return null gracefully
      const result = await getAbapDoc('abap-7.58-nonexistent-file', '7.58');
      expect(result).toBeNull();
    }, 5000);
  });

  describe('Critical Path: Inline Declarations Test', () => {
    it('🎯 CRITICAL: Should find abeninline_declarations.md for "Inline Declarations"', async () => {
      const result = await searchAbapDocs('Inline Declarations', '7.58', 10);
      
      console.log('🔍 Search results for "Inline Declarations":');
      result.results.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.title} (${r.type}) - Score: ${r.score}`);
        if (r.file) console.log(`     File: ${r.file}`);
      });
      
      // Must find results
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      
      // Must find the specific inline declarations file
      const inlineDeclarationsFile = result.results.find(r => 
        r.file?.includes('abeninline_declarations.md')
      );
      
      expect(inlineDeclarationsFile).toBeDefined();
      expect(inlineDeclarationsFile?.type).toBe('individual');
      expect(inlineDeclarationsFile?.title).toMatch(/📄.*inline.*declarations/i);
      
      // Should have high relevance score for exact match
      expect(inlineDeclarationsFile?.score).toBeGreaterThan(50);
      
      console.log(`✅ Found target file: ${inlineDeclarationsFile?.file}`);
      console.log(`✅ Score: ${inlineDeclarationsFile?.score}`);
      console.log(`✅ Type: ${inlineDeclarationsFile?.type}`);
    }, 15000);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractVocabularyTerms } from '../scripts/odata-vocabulary-terms.js';

describe('OData vocabulary table terms', () => {
  it('indexes definitions beyond the initial table rows and retains experimental notices', () => {
    const terms = extractVocabularyTerms(`## Terms
Term|Type|Description
:---|:---|:---
[LineItem](UI.xml#L147)|\\[[DataFieldAbstract](#DataFieldAbstract)\\]|<a name="LineItem"></a>Collection of data fields for representation in a table or list
[CardItem](UI.xml#L152) *([Experimental](Common.md#Experimental))*|[CardItemType](#CardItemType)|<a name="CardItem"></a>Defines the card structure
## Types
[NotATerm](UI.xml#L200)|String|A property
`, 'UI.md');
    expect(terms.map(term => term.name)).toEqual(['LineItem', 'CardItem']);
    expect(terms[0].title).toBe('UI.LineItem — OData annotation term');
    expect(terms[0].description).toContain('Collection of data fields');
    expect(terms[1].description).toContain('Experimental');
  });

  it('finds real SAP UI and Common annotation definitions', () => {
    for (const [file, term] of [['UI.md', 'LineItem'], ['Common.md', 'ValueList']]) {
      const content = readFileSync(`sources/odata-vocabularies/vocabularies/${file}`, 'utf8');
      expect(extractVocabularyTerms(content, file).some(row => row.name === term)).toBe(true);
    }
  });
});

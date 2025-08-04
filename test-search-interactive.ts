#!/usr/bin/env tsx
// Interactive search test with multiple keywords and analysis
import { searchLibraries } from './src/lib/localDocs.ts';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Predefined test cases with expected contexts
const testCases = [
  { query: 'wizard', expectedContext: 'UI5', description: 'UI5 Wizard control' },
  { query: 'cds entity', expectedContext: 'CAP', description: 'CAP entity definition' },
  { query: 'wdi5 testing', expectedContext: 'wdi5', description: 'wdi5 testing framework' },
  { query: 'service', expectedContext: 'CAP', description: 'Generic service (should prioritize CAP)' },
  { query: 'annotation', expectedContext: 'MIXED', description: 'Annotations (CAP/UI5)' },
  { query: 'sap.m.Button', expectedContext: 'UI5', description: 'Specific UI5 control' },
  { query: 'browser automation', expectedContext: 'wdi5', description: 'Browser testing' },
  { query: 'fiori elements', expectedContext: 'UI5', description: 'Fiori Elements' }
];

async function runSingleTest(query: string, expectedContext?: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Testing: "${query}"${expectedContext ? ` (Expected: ${expectedContext})` : ''}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const startTime = Date.now();
    const result = await searchLibraries(query);
    const endTime = Date.now();
    
    if (result.results.length > 0) {
      const description = result.results[0].description;
      
      // Extract detected context
      const contextMatch = description.match(/\*\*(\w+) Context\*\*/);
      const detectedContext = contextMatch ? contextMatch[1] : 'Unknown';
      
      // Show performance and context
      console.log(`⏱️  Search time: ${endTime - startTime}ms`);
      console.log(`🎯 Detected context: ${detectedContext}`);
      if (expectedContext) {
        const isCorrect = detectedContext === expectedContext || expectedContext === 'MIXED';
        console.log(`✅ Context match: ${isCorrect ? 'YES' : 'NO'} ${isCorrect ? '✅' : '❌'}`);
      }
      
      // Extract first few results for summary
      const lines = description.split('\n');
      const foundLine = lines.find(line => line.includes('Found'));
      if (foundLine) {
        console.log(`📊 ${foundLine}`);
      }
      
      // Show top result
      const topResultLine = lines.find(line => line.includes('⭐️'));
      if (topResultLine) {
        console.log(`🏆 Top result: ${topResultLine.substring(0, 80)}...`);
      }
      
      // Show library sections found
      const sections = [];
      if (description.includes('🏗️ **CAP Documentation:**')) sections.push('CAP');
      if (description.includes('🧪 **wdi5 Documentation:**')) sections.push('wdi5'); 
      if (description.includes('📖 **SAPUI5 Guides:**')) sections.push('SAPUI5');
      if (description.includes('🔹 **UI5 API Documentation:**')) sections.push('UI5-API');
      if (description.includes('🔸 **UI5 Samples:**')) sections.push('UI5-Samples');
      
      console.log(`📚 Libraries found: ${sections.join(', ') || 'None'}`);
      
    } else {
      console.log('❌ No results found');
      if (result.error) {
        console.log(`📝 Error: ${result.error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
}

async function runAllTests() {
  console.log('🧪 Running all predefined test cases...\n');
  
  for (const testCase of testCases) {
    await runSingleTest(testCase.query, testCase.expectedContext);
  }
  
  console.log('\n🎉 All tests completed!');
}

async function interactiveMode() {
  console.log(`
🎯 SAP Docs Interactive Search Test

Commands:
  - Enter any search term to test
  - 'all' - Run all predefined tests  
  - 'list' - Show predefined test cases
  - 'quit' or 'exit' - Exit
`);
  
  const question = () => {
    rl.question('\n🔍 Enter search term (or command): ', async (input) => {
      const trimmed = input.trim();
      
      if (trimmed === 'quit' || trimmed === 'exit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }
      
      if (trimmed === 'all') {
        await runAllTests();
        question();
        return;
      }
      
      if (trimmed === 'list') {
        console.log('\n📋 Predefined test cases:');
        testCases.forEach((tc, i) => {
          console.log(`  ${i + 1}. "${tc.query}" (${tc.expectedContext}) - ${tc.description}`);
        });
        question();
        return;
      }
      
      if (trimmed) {
        await runSingleTest(trimmed);
      }
      
      question();
    });
  };
  
  question();
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  interactiveMode();
} else if (args[0] === 'all') {
  runAllTests().then(() => process.exit(0));
} else {
  const query = args.join(' ');
  runSingleTest(query).then(() => process.exit(0));
}
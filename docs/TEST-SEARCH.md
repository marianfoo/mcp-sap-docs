> Historical documentation note
>
> This file is kept for background and milestone history.
> For the current architecture and operational model, start with:
> README.md, docs/ARCHITECTURE.md, docs/DEV.md, docs/TESTS.md, and docs/UPSTREAM-ONE-WAY-SYNC-IMPLEMENTATION.md.

# 🔍 SAP Docs Search Testing Guide

Test the enhanced context-aware search functionality using these testing tools.

## 📁 Test Files Available

### 1. **Simple Search Test** (`test-search.ts`)
Quick command-line search testing with any keyword.

```bash
# Test with default keyword
npx tsx test-search.ts

# Test specific keywords
npx tsx test-search.ts wizard
npx tsx test-search.ts "cds entity"
npx tsx test-search.ts "wdi5 testing"
npx tsx test-search.ts annotation
```

**Features:**
- ⏱️ Performance timing
- 📊 Result summary
- 🎯 Context detection display
- 📖 Top result preview

### 2. **Interactive Search Test** (`test-search-interactive.ts`)
Advanced testing with multiple modes and analysis.

```bash
# Interactive mode
npx tsx test-search-interactive.ts

# Run all predefined tests
npx tsx test-search-interactive.ts all

# Test specific query
npx tsx test-search-interactive.ts "your search term"
```

**Interactive Commands:**
- `all` - Run all predefined test cases
- `list` - Show predefined test cases
- `quit` / `exit` - Exit interactive mode
- Any keyword - Test search

**Features:**
- 🧪 Predefined test cases with expected contexts
- ✅ Context validation
- 📚 Library breakdown analysis
- 🏆 Top result highlighting
- ⏱️ Performance metrics

### 3. **HTTP API Tests** (`test-search.http`) ✅ **WORKING**
Test the HTTP server endpoints (requires VS Code REST Client or similar).

**First, start the HTTP server:**
```bash
npm run start:http
```

**Then use the `.http` file to test:**
- Server status check
- Various search queries  
- Context-specific tests
- **Full search functionality** with context-aware results

**Example response for "wizard":**
```json
{
  "role": "assistant", 
  "content": "Found 10 results for 'wizard' 🎨 **UI5 Context**:\n\n🔹 **UI5 API Documentation:**\n⭐️ **sap.f.SidePanel** (Score: 100)..."
}
```

## 🎯 Test Categories

### **UI5 Context Tests**
```bash
npx tsx test-search.ts wizard
npx tsx test-search.ts "sap.m.Button"
npx tsx test-search.ts "fiori elements"
```
Expected: 🎨 **UI5 Context** with UI5 API/Samples first

### **CAP Context Tests**
```bash
npx tsx test-search.ts "cds entity"
npx tsx test-search.ts service
npx tsx test-search.ts aspect
```
Expected: 🏗️ **CAP Context** with CAP Documentation first

### **wdi5 Context Tests**
```bash
npx tsx test-search.ts "wdi5 testing"
npx tsx test-search.ts "browser automation"
npx tsx test-search.ts "e2e test"
```
Expected: 🧪 **wdi5 Context** with wdi5 Documentation first

### **Mixed Context Tests**
```bash
npx tsx test-search.ts annotation
npx tsx test-search.ts authentication
npx tsx test-search.ts routing
```
Expected: Context varies based on strongest signal

## 📊 Understanding Results

### **Context Detection** 🎯
- **🎨 UI5 Context**: UI5 controls, Fiori, frontend development
- **🏗️ CAP Context**: CDS, entities, services, backend development  
- **🧪 wdi5 Context**: Testing, automation, browser testing
- **🔀 MIXED Context**: Cross-platform or unclear context

### **Scoring System** ⭐
- **Score 100**: Perfect matches
- **Score 90+**: High relevance matches
- **Score 80+**: Good matches with context boost
- **Score 70+**: Moderate relevance
- **Score <70**: Lower relevance (often filtered out)

### **Library Prioritization** 📚
Results are ordered by relevance score, with context-aware penalties:
- **CAP queries**: OpenUI5 results get 70% penalty (unless integration-related)
- **wdi5 queries**: OpenUI5 results get 80% penalty (unless testing-related)
- **UI5 queries**: CAP/wdi5 results get 60% penalty (unless backend/testing-related)

## 🧪 Example Test Session

```bash
# Start interactive testing
npx tsx test-search-interactive.ts

🔍 Enter search term (or command): wizard
🎯 Detected context: UI5
✅ Context match: YES ✅
🏆 Top result: ⭐️ **sap.f.SidePanel** (Score: 100)...
📚 Libraries found: UI5-API, UI5-Samples

🔍 Enter search term (or command): cds entity  
🎯 Detected context: CAP
✅ Context match: YES ✅
🏆 Top result: ⭐️ **Core / Built-in Types** (Score: 100)...
📚 Libraries found: CAP

🔍 Enter search term (or command): all
🧪 Running all predefined test cases...
[Runs comprehensive test suite]
```

## 🚀 Quick Start

1. **Test a simple search:**
   ```bash
   npx tsx test-search.ts wizard
   ```

2. **Run the full test suite:**
   ```bash
   npx tsx test-search-interactive.ts all
   ```

3. **Test HTTP API (optional):**
   ```bash
   npm run start:http
   # Then use test-search.http file
   ```

## 📈 Performance Benchmarks

Typical search times:
- **Simple queries**: 1-3 seconds
- **Complex queries**: 2-5 seconds
- **First search** (cold start): May take longer due to index loading

## 🔧 Troubleshooting

**No results found:**
- Check spelling
- Try broader terms
- Use predefined test cases to verify system works

**Slow performance:**
- First search loads index (normal)
- Subsequent searches should be faster
- Check available memory

**Wrong context detection:**
- Context is based on keyword analysis
- Mixed contexts are normal for generic terms
- Use more specific terms for better context detection
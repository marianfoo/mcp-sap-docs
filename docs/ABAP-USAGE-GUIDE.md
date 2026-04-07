> Historical documentation note
>
> This file is kept for background and milestone history.
> For the current architecture and operational model, start with:
> README.md, docs/ARCHITECTURE.md, docs/DEV.md, docs/TESTS.md, and docs/UPSTREAM-ONE-WAY-SYNC-IMPLEMENTATION.md.

# ABAP Documentation Usage Guide

## 🎯 **Overview**

ABAP documentation is now fully integrated into the standard MCP search system with **intelligent version filtering** for clean, focused results.

## 🔍 **How to Search ABAP Documentation**

### **Standard Interface - No Special Tools**
Use **`search`** for all ABAP queries - same as UI5, CAP, wdi5!

### **✅ General ABAP Queries (Latest + Context)**

#### **Query Patterns:**
```javascript
search: "inline declarations"
search: "SELECT statements"  
search: "exception handling"
search: "class definition"
search: "internal table operations"
```

#### **What You Get:**
- **Latest ABAP documentation** - Most current syntax and features
- **Clean ABAP style guides** - Best practices and guidelines  
- **ABAP cheat sheets** - Practical examples and working code
- **4-5 focused results** - No version clutter or duplicates

#### **Example Result:**
```
Found 4 results for 'inline declarations':

⭐️ SAP Style Guides - Best practices (Score: 22.75)
   Prefer inline to up-front declarations
   🔗 Clean ABAP guidelines

⭐️ ABAP Cheat Sheets - Examples (Score: 19.80)  
   Inline Declaration, CAST Operator, Method Chaining
   🔗 Practical code examples

⭐️ Latest ABAP Docs - Programming guide (Score: 18.59)
   Background The declaration operators - [DATA(var)] for variables
   
⭐️ Latest ABAP Docs - Language reference (Score: 17.72)
   An inline declaration is performed using a declaration operator...
```

### **✅ Version-Specific Queries (Targeted)**

#### **Query Patterns:**
```javascript
search: "LOOP AT cloud"         # → ABAP Cloud docs
search: "CDS views latest"      # → Latest Standard ABAP docs  
```

#### **What You Get:**
- **Requested ABAP version only** - No other versions shown
- **Dramatically boosted scores** - Requested version gets priority
- **Related sources included** - Style guides and cheat sheets for context
- **Clean, targeted results** - 5-8 results, all relevant

#### **Example Result:**
```
Found 5 results for 'LOOP cloud':

⭐️ /abap-docs-cloud/abenloop_glosry (Score: 14.35) - Boosted 7.57 docs
   Loops - This section describes the loops defined using DO-ENDDO, WHILE-ENDWHILE
   
⭐️ /abap-docs-cloud/abenabap_loops (Score: 14.08) - Boosted 7.57 docs  
   ABAP Loops - Loop processing and control structures
   
⭐️ /abap-docs-cloud/abapexit_loop (Score: 13.53) - Boosted 7.57 docs
   EXIT, loop - Exits a loop completely with EXIT statement
   
⭐️ Style guides and cheat sheets for additional context
```

---

## **📖 Document Retrieval**

### **Standard Document Access**
```javascript
// Use IDs from search results
fetch: "/abap-docs-latest/abeninline_declarations"
fetch: "/abap-docs-cloud/abenselect"  
fetch: "/abap-docs-cloud/abenloop_glosry"
```

### **What You Get:**
- **Complete documentation** with full content and examples
- **Official attribution** - Direct links to help.sap.com
- **Rich formatting** - Optimized for LLM consumption
- **Source context** - Version, category, and related concepts

---

## **🎯 Supported ABAP Language Versions**

| Version | Library ID | Default Boost | When Shown |
|---------|------------|---------------|------------|
| **Standard** | `/abap-docs-latest` | 1.0 | Always (default) |
| **Cloud** | `/abap-docs-cloud` | 0.8 | On request |

### **Context Boosting**
When versions are mentioned in queries, they get **2.0x boost** for perfect targeting.

---

## **💡 Query Examples**

### **ABAP Language Concepts**
```javascript
// General queries (latest ABAP + context)
"How do I use inline declarations?"          → Latest ABAP + style guides + examples
"What are different LOOP statement types?"  → Latest ABAP + best practices  
"Explain exception handling in ABAP"        → Latest ABAP + clean code guidelines
"ABAP object-oriented programming"          → Latest ABAP + OOP examples

// Expected: 4-5 clean, focused results
```

### **Cross-Source Discovery**
```javascript
// Finds related content across all sources
"ABAP class definition best practices"       → Official docs + Clean ABAP + examples
"SELECT statement performance optimization"  → ABAP syntax + performance guides + examples
"ABAP clean code guidelines"                → Style guides + latest syntax + examples
```

---

## **📈 Performance & Quality**

### **Search Quality**
- **4-5 focused results** instead of 25 crowded duplicates
- **Rich content descriptions** with actual explanations  
- **Cross-source intelligence** - finds related content everywhere
- **Perfect relevance** - only show what's actually needed

### **Version Management**
- **Latest by default** - always current unless specified otherwise
- **Smart targeting** - specific ABAP Language Versions only when requested
- **Automatic detection** - no need to specify version parameters manually
- **Clean results** - no version clutter or noise

### **Content Quality**  
- **13,163 curated files** - irrelevant content filtered out
- **Meaningful frontmatter** - structured metadata for better AI understanding
- **Official attribution** - complete source linking to help.sap.com
- **LLM-optimized** - perfect file sizes and content structure

---

## **🔄 Migration from Old Tools**

### **Old Approach (Deprecated)**
```javascript
// Required specialized tools (now deprecated)
abap_search: "inline declarations"
abap_get: "abap-7.58-individual-abeninline_declarations"
```

### **New Approach (Standard)**
```javascript
// Uses unified tool like everything else
search: "inline declarations"
fetch: "/abap-docs-latest/abeninline_declarations"
```

### **Benefits of Migration**
- ✅ **Simpler interface** - one tool for all SAP development
- ✅ **Better results** - intelligent filtering and cross-source discovery
- ✅ **Rich content** - meaningful descriptions and context
- ✅ **Version flexibility** - automatic management with manual override

---

## **🚀 Production Usage**

### **For LLM Interactions**
```
Human: "How do I handle exceptions in ABAP?"

LLM uses: search: "exception handling"

Gets: 
✅ Latest ABAP exception syntax
✅ Clean ABAP best practices  
✅ Practical examples with TRY/CATCH
✅ Cross-references to related concepts
```

### **For Version-Specific Development**
```
Human: "I'm working with Standard ABAP, how do LOOP statements work?"

LLM uses: search: "LOOP statements latest"

Gets:
✅ ABAP loop documentation only
✅ Version-specific features and limitations
✅ Related style guides and examples
✅ No confusion from other versions
```

---

## **📋 Summary**

**The ABAP integration is now complete and production-ready with:**

- ✅ **Unified interface** - same tool for all SAP development
- ✅ **Intelligent filtering** - clean, focused results
- ✅ **Rich content** - meaningful descriptions and context
- ✅ **Version flexibility** - latest by default, specific when needed
- ✅ **Cross-source intelligence** - finds related content everywhere
- ✅ **Standard architecture** - proven, scalable, maintainable

**Result: The cleanest, most intelligent ABAP documentation search experience available for LLMs!** 🎉

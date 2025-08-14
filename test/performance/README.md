# Performance Benchmarks

This directory contains performance tests for the hybrid search system.

## Reranker Benchmark

The `reranker-benchmark.js` script compares performance between:
- **BM25-only mode** (`RERANKER_MODEL=""`)
- **BGE reranker mode** (`RERANKER_MODEL="Xenova/bge-reranker-base"`)

### Usage

```bash
npm run benchmark:reranker
```

### What it measures

1. **Startup Time**: How long each server takes to become ready
2. **Request Times**: Average response time for various queries
3. **Memory Usage**: RAM consumption for each mode

### Test Queries

The benchmark tests these representative queries:
- `extensionAPI` - Simple term search
- `UI.Chart #SpecificationWidthColumnChart` - Complex annotation query
- `column micro chart sapui5` - Multi-term search
- `Use enums cql cap` - Technical documentation query
- `getting started with sap cloud sdk for ai` - Long descriptive query

### Expected Results

**BM25-only mode:**
- Startup: ~1-2 seconds
- Requests: ~50-150ms average
- Memory: ~200-400MB

**BGE reranker mode:**
- Startup: ~5-60 seconds (depending on model download)
- Requests: ~200-800ms average  
- Memory: ~2-3GB additional

### Notes

- First run with BGE model will be slower due to model download
- Subsequent runs will be faster as model is cached
- Results may vary based on hardware and network conditions
- The benchmark uses different ports (3901, 3902) to avoid conflicts

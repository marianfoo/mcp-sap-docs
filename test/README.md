# URL Validation Testing Scripts

This directory contains comprehensive URL validation tools for the SAP Docs MCP server. These tools help ensure that generated documentation URLs are accurate and reachable.

## 🚀 Quick Start

```bash
# Check URL generation status for all sources
npm run test:urls:status

# Test random URLs from all sources (comprehensive)
npm run test:urls

# Quick test of specific sources
npm run test:urls:quick cloud-sdk 2
```

## 📋 Available Scripts

### 1. `npm run test:urls` - Comprehensive URL Validation

**File**: `validate-urls.ts`

Tests 5 random URLs from each documentation source in parallel. Provides detailed reporting including:
- Success/failure rates by source
- Response times and performance metrics
- Failed URL analysis
- Overall coverage statistics

```bash
npm run test:urls
```

**Sample Output**:
```
🔗 SAP Docs MCP - URL Validation Tool
Testing random URLs from each documentation source...

📚 Testing SAPUI5 (/sapui5)
   ✅ [200] View Gallery (221ms)
   ✅ [200] Ordering (190ms)
   Results: ✅ 5 OK, ❌ 0 Failed

📊 SUMMARY REPORT
Overall Results:
  Total URLs tested: 55
  Successful: 34
  Failed: 21
  Success rate: 61.8%
```

### 2. `npm run test:urls:quick` - Quick Targeted Testing

**File**: `quick-url-test.ts`

Fast testing of specific sources with configurable sample size.

```bash
# Test 2 URLs from Cloud SDK sources
npm run test:urls:quick cloud-sdk 2

# Test 5 URLs from CAP
npm run test:urls:quick cap 5

# Test 1 URL from UI5 sources
npm run test:urls:quick ui5 1

# Test 3 URLs from all sources (default)
npm run test:urls:quick
```

**Sample Output**:
```
🔗 Quick URL Test

📚 Cloud SDK (JavaScript)
  ✅ [200] Getting Started
     https://sap.github.io/cloud-sdk/docs/js/getting-started
     215ms
```

### 3. `npm run test:urls:status` - URL Configuration Status

**File**: `url-status.ts`

Shows which sources have URL generation configured and provides system overview.

```bash
npm run test:urls:status
```

**Sample Output**:
```
🔗 URL Generation Status

✅ Sources with URL generation (11):
  ✅ Cloud SDK (JavaScript) (/cloud-sdk-js)
     📄 394 documents
     🌐 https://sap.github.io/cloud-sdk/docs/js

❌ Sources without URL generation (1):
  ❌ OpenUI5 Samples (/openui5-samples)

📊 Summary:
  URL generation coverage: 92%
```

## 🎯 Use Cases

### Development Workflow
1. **Check status**: Run `npm run test:urls:status` to see URL configuration coverage
2. **Quick test**: Use `npm run test:urls:quick` to test specific sources you're working on
3. **Full validation**: Run `npm run test:urls` before releases to ensure URL accuracy

### CI/CD Integration
```bash
# Add to your CI pipeline
npm run test:urls
if [ $? -ne 0 ]; then
  echo "URL validation failed"
  exit 1
fi
```

### Debugging URL Issues
```bash
# Test specific problematic source
npm run test:urls:quick ui5-tooling 5

# Check if URL generation is configured
npm run test:urls:status
```

## 📊 Understanding Results

### Status Codes
- **✅ 200**: URL is valid and reachable
- **❌ 404**: URL not found (indicates URL generation issue)
- **❌ 0**: Network error or timeout

### Success Rates by Source Type
- **100%**: Well-configured sources (SAPUI5, CAP, wdi5)
- **60-80%**: Sources with some URL pattern issues (Cloud SDK variants)
- **0%**: Sources with systematic URL generation problems (UI5 Tooling, Web Components)

### Performance Metrics
- **<200ms**: Good response time
- **200-400ms**: Acceptable response time
- **>400ms**: Slow response (investigate server or network issues)

## 🔧 Features

### Parallel Testing
All URL tests run in parallel for maximum speed and efficiency.

### Error Handling
- Network timeouts (10 second default)
- Graceful failure handling
- Detailed error reporting

### Colored Output
- ✅ Green: Success
- ❌ Red: Failure
- ⚠️ Yellow: Warnings
- 🔵 Blue: Information

### Flexible Filtering
- Test specific sources by name or ID
- Configurable sample sizes
- Support for partial name matching

## 🚀 Advanced Usage

### Custom Source Testing
```bash
# Test only CAP documentation
npx tsx test/quick-url-test.ts cap 10

# Test all UI5-related sources
npx tsx test/quick-url-test.ts ui5 3
```

### Programmatic Usage
```typescript
import { generateDocumentationUrl } from '../src/lib/url-generation/index.js';
import { getDocUrlConfig } from '../src/lib/metadata.js';

const config = getDocUrlConfig('/cloud-sdk-js');
const url = generateDocumentationUrl('/cloud-sdk-js', 'guides/debug.mdx', content, config);
```

## 🐛 Troubleshooting

### Common Issues

1. **"Index not found" Error**
   ```bash
   npm run build
   ```

2. **High Failure Rate**
   - Check internet connection
   - Verify URL patterns in `src/metadata.json`
   - Check if documentation sites are accessible

3. **Timeout Errors**
   - Network connectivity issues
   - Server temporarily unavailable
   - Consider increasing timeout in code

### Debugging Steps

1. Run status check to see configuration:
   ```bash
   npm run test:urls:status
   ```

2. Test a small sample first:
   ```bash
   npm run test:urls:quick problematic-source 1
   ```

3. Check URL generation for specific files:
   ```bash
   # Look at the generated URLs in the output
   npm run test:urls:quick source-name 1
   ```

## 📈 Metrics and Reporting

The comprehensive test provides detailed metrics:
- **Overall success rate**: Percentage of working URLs
- **Per-source breakdown**: Success rates for each documentation source
- **Performance analysis**: Average and maximum response times
- **Failed URL listing**: Complete list of broken URLs for investigation

These metrics help identify:
- Sources needing URL pattern fixes
- Documentation sites with accessibility issues
- Performance bottlenecks in URL validation

## 🎉 Success Stories

After implementing this URL validation system:
- **Fixed Cloud SDK URLs**: Correct frontmatter-based URL generation
- **Identified broken patterns**: Found UI5 Tooling URL configuration issues
- **Performance insights**: Average response time of 233ms across all sources
- **Coverage improvement**: 92% of sources now have URL generation configured
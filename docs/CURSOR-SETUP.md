# 🎯 Cursor IDE Optimization Guide

## Overview

This guide explains how to optimize Cursor IDE for the SAP Docs MCP project using `.cursorignore` and Project Rules to improve AI assistance quality and response speed.

## 📁 File Structure

```
.cursorignore                    # Exclude large/irrelevant files
.cursor/
└── rules/                       # Project-specific rules
    ├── 00-overview.mdc          # High-level system overview
    ├── 10-search-stack.mdc      # Search and indexing
    ├── 20-tools-and-apis.mdc    # MCP tools and endpoints
    ├── 30-tests-and-output.mdc  # Testing and validation
    ├── 40-deploy.mdc            # Deployment and operations
    └── 50-metadata-config.mdc   # Configuration management
docs/
├── ARCHITECTURE.md              # System architecture
├── DEV.md                       # Development guide
├── TESTS.md                     # Testing guide
└── CURSOR-SETUP.md             # This guide
```

## 🚫 .cursorignore Configuration

### Purpose
Keeps the index small and responses focused by excluding:
- Build artifacts and caches
- Large vendor documentation
- Generated search databases
- Test artifacts and logs

### Current Configuration
```gitignore
# Build output & caches
dist/**
node_modules/**
.cache/**
coverage/**
*.log

# Large vendor docs & tests
sources/**/test/**
sources/openui5/**/test/**
sources/**/.git/**
sources/**/.github/**
sources/**/node_modules/**

# Generated search artifacts
dist/data/index.json
dist/data/*.sqlite
dist/data/*.db

# Test artifacts
test-*.js
debug-*.js
*.tmp
```

## 📋 Project Rules System

### Rule Structure
Each rule file (`.mdc`) contains:
- **Purpose**: When to use this rule
- **Key Concepts**: Important information for that domain
- **File References**: `@file` directives to auto-attach relevant context

### Current Rules

#### **00-overview.mdc** - System Overview
- **When**: "how it works", "where to change X", "what runs in prod"
- **Covers**: Architecture, components, production setup
- **Files**: Core system files (server.ts, metadata.json, config.ts)

#### **10-search-stack.mdc** - Search & Indexing
- **When**: Modifying search behavior, ranking, or index builds
- **Covers**: BM25 search, FTS5, metadata APIs, query processing
- **Files**: Search-related modules (search.ts, searchDb.ts, metadata.ts)

#### **20-tools-and-apis.mdc** - MCP Tools & Endpoints
- **When**: Tool schemas, request/response formats, endpoints
- **Covers**: 5 MCP tools, server implementations, response formats
- **Files**: Server implementations and tool handlers

#### **30-tests-and-output.mdc** - Tests & Output
- **When**: Changing output formatting or test stability
- **Covers**: Test architecture, expected formats, validation
- **Files**: Test runner, utilities, and test cases

#### **40-deploy.mdc** - Deploy & Operations
- **When**: PM2 processes, GitHub Actions, health checks
- **Covers**: Deployment pipeline, PM2 config, monitoring
- **Files**: Deployment configurations and workflows

#### **50-metadata-config.mdc** - Configuration Management
- **When**: Working with centralized configuration system
- **Covers**: Metadata APIs, configuration structure, adding sources
- **Files**: Metadata system files and documentation

## 🔄 Maintaining Rules (CRITICAL)

### ⚠️ **ALWAYS UPDATE RULES WHEN MAKING CHANGES**

When you modify the system, **immediately update the relevant rules**:

#### **Architecture Changes**
- Update `00-overview.mdc` for system-level changes
- Update `docs/ARCHITECTURE.md` for structural modifications
- Add new `@file` references for new core modules

#### **Search System Changes**
- Update `10-search-stack.mdc` for search logic modifications
- Update file references if search modules are renamed/moved
- Document new search features or configuration options

#### **API/Tool Changes**
- Update `20-tools-and-apis.mdc` for new tools or endpoints
- Update response format documentation
- Add new server implementations to file references

#### **Test Changes**
- Update `30-tests-and-output.mdc` for test format changes
- Document new test categories or validation rules
- Update expected output format examples

#### **Deployment Changes**
- Update `40-deploy.mdc` for PM2 or workflow changes
- Update environment variable documentation
- Add new deployment artifacts or processes

#### **Configuration Changes**
- Update `50-metadata-config.mdc` for metadata system changes
- Document new APIs or configuration options
- Update examples for adding new sources

## 📖 Documentation Integration

### Reference Pattern
Rules reference documentation files using `@file` directives:

```markdown
@file docs/ARCHITECTURE.md
@file docs/DEV.md
@file docs/TESTS.md
```

### Documentation Files
- **ARCHITECTURE.md**: System overview with diagrams
- **DEV.md**: Development commands and common tasks
- **TESTS.md**: Test execution and validation details
- **METADATA-CONSOLIDATION.md**: Configuration system changes

## 🎯 Usage in Cursor

### Automatic Context
Cursor automatically includes relevant rules and files based on:
- Current file being edited
- Keywords in your questions
- Project structure analysis

### Manual Invocation
You can explicitly reference rules:
```
@Cursor Rules search-stack
@Files src/lib/search.ts
```

### Best Practices
1. **Specific Questions**: Ask about specific components for better rule matching
2. **Context Hints**: Mention the area you're working on (search, deploy, tests)
3. **File References**: Open relevant files to provide additional context

## 🔧 Optimization Tips

### Performance
- **Selective Ignoring**: Add large files to `.cursorignore` immediately
- **Rule Specificity**: Keep rules focused on specific domains
- **File References**: Only include essential files in `@file` directives

### Quality
- **Regular Updates**: Update rules whenever system changes
- **Clear Descriptions**: Use descriptive rule purposes and coverage
- **Comprehensive Coverage**: Ensure all major system areas have rules

### Maintenance
- **Version Control**: Commit rule changes with related code changes
- **Documentation Sync**: Keep rules and docs in sync
- **Regular Review**: Periodically review and update rule effectiveness

## 📋 Rule Update Checklist

When making system changes, check these items:

### ✅ **Before Coding**
- [ ] Identify which rules might be affected
- [ ] Review current rule content for accuracy
- [ ] Plan rule updates alongside code changes

### ✅ **During Development**
- [ ] Update rule content as you make changes
- [ ] Add new `@file` references for new modules
- [ ] Update documentation files if needed

### ✅ **After Changes**
- [ ] Verify all affected rules are updated
- [ ] Test rule effectiveness with sample questions
- [ ] Commit rule changes with code changes
- [ ] Update this guide if rule structure changes

## 🚀 Advanced Usage

### Custom Rules
Create additional rules for:
- **Feature-specific**: Complex features spanning multiple modules
- **Team-specific**: Team conventions and practices
- **Environment-specific**: Development vs production considerations

### Rule Templates
Use this template for new rules:

```markdown
# Rule Title (Rule)

Brief description of when to use this rule.

## Key Concepts
- Important concept 1
- Important concept 2

## Coverage Areas
- Area 1: Description
- Area 2: Description

@file relevant/file1.ts
@file relevant/file2.ts
@file docs/RELEVANT.md
```

### Integration with Workflow
1. **Planning**: Review relevant rules before starting work
2. **Development**: Keep rules open for reference
3. **Review**: Update rules as part of code review process
4. **Documentation**: Use rules to guide documentation updates

## 🎉 Benefits

### For Development
- **Faster Context**: Cursor quickly understands project structure
- **Better Suggestions**: More relevant code suggestions and fixes
- **Reduced Repetition**: Less need to explain system architecture

### For Maintenance
- **Knowledge Preservation**: System knowledge captured in rules
- **Onboarding**: New developers can understand system quickly
- **Consistency**: Consistent approach to similar problems

### For AI Assistance
- **Focused Responses**: AI responses are more targeted and relevant
- **Better Understanding**: AI has deeper context about system design
- **Accurate Suggestions**: Suggestions align with project patterns and conventions

---

**Remember**: The key to effective Cursor optimization is keeping the rules current and comprehensive. Always update rules when making system changes!

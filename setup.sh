#!/bin/bash

# SAP Documentation MCP Server Setup Script
echo "🚀 Setting up SAP Documentation MCP Server..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Clone documentation repositories
echo "📚 Cloning documentation repositories..."

if [ ! -d "./sources/sapui5-docs" ]; then
    echo "  → Cloning SAP UI5 documentation..."
    git clone --depth=1 https://github.com/SAP-docs/sapui5 ./sources/sapui5-docs
else
    echo "  ✓ SAP UI5 documentation already exists"
fi

if [ ! -d "./sources/cap-docs" ]; then
    echo "  → Cloning SAP CAP documentation..."
    git clone --depth=1 https://github.com/cap-js/docs ./sources/cap-docs
else
    echo "  ✓ SAP CAP documentation already exists"
fi

if [ ! -d "./sources/openui5" ]; then
    echo "  → Cloning OpenUI5 API documentation..."
    git clone --depth=1 https://github.com/SAP/openui5 ./sources/openui5
else
    echo "  ✓ OpenUI5 API documentation already exists"
fi

# Build the search index
echo "🔍 Building search index..."
npm run build
npm run build:all

echo "✅ Setup complete!"
echo ""
echo "To start the MCP server:"
echo "  npm start"
echo ""
echo "To use in Cursor:"
echo "1. Open Cursor IDE"
echo "2. Go to Tools → Add MCP Server"
echo "3. Use command: npm start"
echo "4. Set working directory to: $(pwd)" 
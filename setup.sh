#!/bin/bash

# SAP Documentation MCP Server Setup Script
echo "🚀 Setting up SAP Documentation MCP Server..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Initialize and update git submodules
echo "📚 Initializing documentation submodules..."

# Initialize submodules if not already done
if [ ! -d "./sources/sapui5-docs" ]; then
    echo "  → Initializing git submodules..."
    git submodule update --init
else
    echo "  ✓ Submodules already initialized"
fi

# Update submodules to latest
echo "  → Updating submodules to latest..."
git submodule sync --recursive
git submodule update --init

# Build the search index
echo "🔍 Building search index..."
npm run build

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
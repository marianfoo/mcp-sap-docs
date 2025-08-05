#!/bin/bash

# Test script to verify MCP proxy port configuration
echo "Testing MCP proxy configuration..."

# Check if mcp-proxy is available
if command -v mcp-proxy &> /dev/null; then
    echo "✅ mcp-proxy found"
    mcp-proxy --help
else
    echo "❌ mcp-proxy not found in PATH"
    echo "Looking for mcp-proxy in common locations..."
    
    # Check common locations
    for path in "/opt/mcp-sap/venv/bin/mcp-proxy" "/usr/local/bin/mcp-proxy" "$HOME/.local/bin/mcp-proxy"; do
        if [ -f "$path" ]; then
            echo "✅ Found mcp-proxy at: $path"
            echo "Testing with --help..."
            "$path" --help
            break
        fi
    done
fi

echo ""
echo "Current PM2 processes:"
pm2 list

echo ""
echo "Testing port 18080 availability:"
if lsof -i :18080 &> /dev/null; then
    echo "❌ Port 18080 is already in use:"
    lsof -i :18080
else
    echo "✅ Port 18080 is available"
fi 
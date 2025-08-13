#!/bin/bash

# SAP Documentation MCP Server Setup Script
echo "🚀 Setting up SAP Documentation MCP Server..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Initialize and update git submodules
echo "📚 Initializing documentation submodules..."

# Initialize/update submodules (including new ones) to latest
echo "  → Syncing submodule configuration..."
git submodule sync --recursive

# Collect submodules from .gitmodules
echo "  → Ensuring all top-level submodules are present (shallow, single branch)..."
while IFS= read -r line; do
  name=$(echo "$line" | awk '{print $1}' | sed -E 's/^submodule\.([^ ]*)\.path$/\1/')
  path=$(echo "$line" | awk '{print $2}')
  branch=$(git config -f .gitmodules "submodule.${name}.branch" || echo main)
  url=$(git config -f .gitmodules "submodule.${name}.url")

  # Skip if missing required fields
  [ -z "$path" ] && continue
  [ -z "$url" ] && continue

  echo "    • $path (branch: $branch)"

  if [ ! -d "$path/.git" ]; then
    echo "      - cloning shallow..."
    GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch "$branch" "$url" "$path" || {
      echo "      ! clone failed for $path, retrying with master"
      GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch master "$url" "$path" || true
    }
  else
    echo "      - updating shallow to latest $branch..."
    # Limit origin to a single branch and fetch shallow
    git -C "$path" config --unset-all remote.origin.fetch >/dev/null 2>&1 || true
    git -C "$path" config remote.origin.fetch "+refs/heads/${branch}:refs/remotes/origin/${branch}"
    git -C "$path" remote set-branches origin "$branch" || true
    # configure partial clone + no-tags for smaller fetches
    git -C "$path" config remote.origin.tagOpt --no-tags || true
    git -C "$path" config remote.origin.promisor true || true
    git -C "$path" config remote.origin.partialclonefilter blob:none || true
    if ! GIT_LFS_SKIP_SMUDGE=1 git -C "$path" fetch --filter=blob:none --no-tags --depth 1 --prune origin "$branch"; then
      echo "      ! fetch failed for $branch, trying master"
      git -C "$path" config remote.origin.fetch "+refs/heads/master:refs/remotes/origin/master"
      git -C "$path" remote set-branches origin master || true
      GIT_LFS_SKIP_SMUDGE=1 git -C "$path" fetch --filter=blob:none --no-tags --depth 1 --prune origin master || true
      branch=master
    fi
    # Checkout/reset to the fetched tip
    git -C "$path" checkout -B "$branch" "origin/$branch" 2>/dev/null || git -C "$path" checkout "$branch" || true
    git -C "$path" reset --hard "origin/$branch" 2>/dev/null || true
    # Compact local repository storage (keeps only the shallow pack)
    git -C "$path" reflog expire --expire=now --all >/dev/null 2>&1 || true
    git -C "$path" gc --prune=now --aggressive >/dev/null 2>&1 || true
  fi
done < <(git config -f .gitmodules --get-regexp 'submodule\..*\.path')

if [ -n "$SKIP_NESTED_SUBMODULES" ]; then
  echo "  → Skipping nested submodule initialization (SKIP_NESTED_SUBMODULES=1)"
else
  echo "  → Initializing nested submodules to pinned commits (shallow)..."
  git submodule update --init --recursive --depth 1 || true
fi

echo "  → Current submodule status:"
git submodule status --recursive || true

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
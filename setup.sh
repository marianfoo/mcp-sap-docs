#!/bin/bash

set -euo pipefail

# SAP Documentation MCP Server Setup Script
printf '🚀 Setting up SAP Documentation MCP Server...\n'

# Install dependencies
printf '📦 Installing dependencies...\n'
npm install

# Initialize and update git submodules
printf '📚 Initializing documentation submodules...\n'

# Initialize/update submodules (including new ones) to latest
printf '  → Syncing submodule configuration...\n'
git submodule sync --recursive

VARIANT_NAME="${MCP_VARIANT:-}"
if [ -z "$VARIANT_NAME" ] && [ -f .mcp-variant ]; then
  VARIANT_NAME="$(tr -d '[:space:]' < .mcp-variant)"
fi
if [ -z "$VARIANT_NAME" ]; then
  VARIANT_NAME="sap-docs"
fi

ALLOWED_SUBMODULE_PATHS="$({
  node --input-type=module -e '
    import fs from "node:fs";
    import path from "node:path";

    const variant = (process.env.MCP_VARIANT || "").trim() || fs.readFileSync(path.resolve(process.cwd(), ".mcp-variant"), "utf8").trim() || "sap-docs";
    const configPath = path.resolve(process.cwd(), "config", "variants", `${variant}.json`);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    for (const item of config.submodulePaths || []) {
      console.log(item);
    }
  ';
} 2>/dev/null || true)"

if [ -z "$ALLOWED_SUBMODULE_PATHS" ]; then
  printf '⚠️  Could not resolve variant submodule paths, defaulting to all .gitmodules entries.\n'
fi

printf '  → Active MCP variant: %s\n' "$VARIANT_NAME"

# Store allowed paths as newline-delimited string (bash 3.2 compatible, no associative arrays)
ALLOWED_SUBMODULES_LIST="$ALLOWED_SUBMODULE_PATHS"

# Returns space-separated sparse-checkout dirs (relative to submodule root) for repos
# where only a subdirectory is indexed. Empty string = whole repo is needed.
# Derived from the absDir paths in scripts/build-index.ts and src/lib/sapReleasedObjects/constants.ts.
get_sparse_paths() {
  case "$1" in
    sources/sapui5-docs)                 printf 'docs' ;;
    sources/openui5)                     printf 'src' ;;
    sources/wdi5)                        printf 'docs' ;;
    sources/ui5-tooling)                 printf 'docs' ;;
    sources/cloud-mta-build-tool)        printf 'docs' ;;
    sources/ui5-webcomponents)           printf 'docs' ;;
    sources/cloud-sdk)                   printf 'docs-js docs-java' ;;
    sources/cloud-sdk-ai)                printf 'docs-js docs-java' ;;
    sources/ui5-cc-spreadsheetimporter)  printf 'docs' ;;
    sources/dsag-abap-leitfaden)         printf 'docs' ;;
    sources/abap-docs)                   printf 'docs' ;;
    sources/btp-cloud-platform)          printf 'docs' ;;
    sources/sap-artificial-intelligence) printf 'docs' ;;
    sources/terraform-provider-btp)      printf 'docs' ;;
    sources/abap-atc-cr-cv-s4hc)         printf 'src' ;;
    *)                                   printf '' ;;
  esac
}

# Collect submodules from .gitmodules
printf '  → Ensuring variant submodules are present (shallow, single branch)...\n'
while IFS= read -r line; do
  name=$(echo "$line" | awk '{print $1}' | sed -E 's/^submodule\.([^ ]*)\.path$/\1/')
  path=$(echo "$line" | awk '{print $2}')
  branch=$(git config -f .gitmodules "submodule.${name}.branch" || echo main)
  url=$(git config -f .gitmodules "submodule.${name}.url")

  # Skip if missing required fields
  [ -z "$path" ] && continue
  [ -z "$url" ] && continue

  if [ -n "$ALLOWED_SUBMODULES_LIST" ] && ! printf '%s\n' "$ALLOWED_SUBMODULES_LIST" | grep -qxF "$path"; then
    printf '    • %s (skipped for variant %s)\n' "$path" "$VARIANT_NAME"
    continue
  fi

  SPARSE_PATHS="$(get_sparse_paths "$path")"
  printf '    • %s (branch: %s)\n' "$path" "$branch"

  if [ ! -d "$path/.git" ]; then
    if [ -n "$SPARSE_PATHS" ]; then
      printf '      - cloning shallow sparse (%s)...\n' "$SPARSE_PATHS"
      _clone_branch="$branch"
      GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --no-checkout --branch "$_clone_branch" "$url" "$path" || {
        printf '      ! clone failed for %s, retrying with master\n' "$path"
        _clone_branch="master"
        GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --no-checkout --branch "$_clone_branch" "$url" "$path" || true
      }
      if [ -d "$path/.git" ]; then
        git -C "$path" sparse-checkout init --cone
        # word-split intentional: SPARSE_PATHS is space-separated directory names
        # shellcheck disable=SC2086
        git -C "$path" sparse-checkout set $SPARSE_PATHS
        GIT_LFS_SKIP_SMUDGE=1 git -C "$path" checkout "$_clone_branch" || true
      fi
    else
      printf '      - cloning shallow...\n'
      GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch "$branch" "$url" "$path" || {
        printf '      ! clone failed for %s, retrying with master\n' "$path"
        GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch master "$url" "$path" || true
      }
    fi
  else
    printf '      - updating shallow to latest %s...\n' "$branch"
    # Apply (or update) sparse checkout before fetch so blobs outside sparse paths
    # are never downloaded and existing ones are removed from the working tree
    if [ -n "$SPARSE_PATHS" ]; then
      git -C "$path" sparse-checkout init --cone 2>/dev/null || true
      # shellcheck disable=SC2086
      git -C "$path" sparse-checkout set $SPARSE_PATHS || true
    fi
    # Limit origin to a single branch and fetch shallow
    git -C "$path" config --unset-all remote.origin.fetch >/dev/null 2>&1 || true
    git -C "$path" config remote.origin.fetch "+refs/heads/${branch}:refs/remotes/origin/${branch}"
    git -C "$path" remote set-branches origin "$branch" || true
    # configure partial clone + no-tags for smaller fetches
    git -C "$path" config remote.origin.tagOpt --no-tags || true
    git -C "$path" config remote.origin.promisor true || true
    git -C "$path" config remote.origin.partialclonefilter blob:none || true
    if ! GIT_LFS_SKIP_SMUDGE=1 git -C "$path" fetch --filter=blob:none --no-tags --depth 1 --prune origin "$branch"; then
      printf '      ! fetch failed for %s, trying master\n' "$branch"
      git -C "$path" config remote.origin.fetch "+refs/heads/master:refs/remotes/origin/master"
      git -C "$path" remote set-branches origin master || true
      GIT_LFS_SKIP_SMUDGE=1 git -C "$path" fetch --filter=blob:none --no-tags --depth 1 --prune origin master || true
      branch=master
    fi
    # Checkout/reset to the fetched tip
    git -C "$path" checkout -B "$branch" "origin/$branch" 2>/dev/null || git -C "$path" checkout "$branch" || true
    git -C "$path" reset --hard "origin/$branch" 2>/dev/null || true
    # Expire stale reflogs so the shallow pack stays trim
    git -C "$path" reflog expire --expire=now --all >/dev/null 2>&1 || true
    # Prune objects orphaned by sparse checkout (frees .git disk space)
    if [ -n "$SPARSE_PATHS" ]; then
      git -C "$path" gc --prune=now --quiet 2>/dev/null || true
    fi
  fi
done < <(git config -f .gitmodules --get-regexp 'submodule\..*\.path')

if [ -n "${SKIP_NESTED_SUBMODULES:-}" ]; then
  printf '  → Skipping nested submodule initialization (SKIP_NESTED_SUBMODULES=1)\n'
else
  printf '  → Initializing nested submodules to pinned commits (shallow)...\n'
  git submodule update --init --recursive --depth 1 || true
fi

printf '  → Current submodule status:\n'
git submodule status --recursive || true

# Build the search index (includes FTS5 and embedding index)
printf '🔍 Building search index (BM25 + embeddings)...\n'
npm run build

printf '✅ Setup complete!\n\n'
printf 'To start the MCP server:\n'
printf '  npm start\n\n'
printf 'To use in Cursor:\n'
printf '1. Open Cursor IDE\n'
printf '2. Go to Tools → Add MCP Server\n'
printf '3. Use command: npm start\n'
printf '4. Set working directory to: %s\n' "$(pwd)"

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

# Prune working-tree directories and .git/modules/ caches for submodules that have been
# removed from .gitmodules. Without this, deleted sources accumulate on the server across
# deploys, wasting disk space and potentially confusing the build index.
printf '  → Pruning removed submodule directories...\n'
REGISTERED_PATHS="$(git config -f .gitmodules --get-regexp 'submodule\..*\.path' 2>/dev/null | awk '{print $2}' || true)"
_PRUNED=0
for _dir in sources/*/; do
  _dir="${_dir%/}"
  # Skip if the glob found nothing
  [ "$_dir" = "sources/*" ] && continue
  # Only touch directories that are (or were) a git submodule checkout
  [ -e "$_dir/.git" ] || continue
  if ! printf '%s\n' "$REGISTERED_PATHS" | grep -qxF "$_dir"; then
    printf '    • Removing stale submodule working tree: %s\n' "$_dir"
    rm -rf "$_dir"
    _PRUNED=$((_PRUNED + 1))
  fi
done
# Also remove orphaned .git/modules/ entries so re-adding a path with the same name later
# does not pick up stale git state from the old checkout.
if [ -d .git/modules/sources ]; then
  for _mod in .git/modules/sources/*/; do
    _mod="${_mod%/}"
    [ "$_mod" = ".git/modules/sources/*" ] && continue
    _mod_name="${_mod##*/}"
    if ! printf '%s\n' "$REGISTERED_PATHS" | grep -qxF "sources/$_mod_name"; then
      printf '    • Removing orphaned git module cache: %s\n' "$_mod"
      rm -rf "$_mod"
      _PRUNED=$((_PRUNED + 1))
    fi
  done
fi
[ "$_PRUNED" -eq 0 ] && printf '    ✓ No stale submodules found\n'
unset _dir _mod _mod_name _PRUNED

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
    sources/architecture-center)         printf 'docs' ;;
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

  # Use -e (file or directory) not -d (directory only): sparse-checkout repos have .git as a
  # gitdir pointer file, not a directory. -d would miss those and trigger a spurious re-clone.
  if [ ! -e "$path/.git" ]; then
    if [ -n "$SPARSE_PATHS" ]; then
      printf '      - cloning shallow sparse (%s)...\n' "$SPARSE_PATHS"
      _clone_branch="$branch"
      GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --no-checkout --branch "$_clone_branch" "$url" "$path" || {
        printf '      ! clone failed for %s, retrying with master\n' "$path"
        _clone_branch="master"
        GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --no-checkout --branch "$_clone_branch" "$url" "$path" || true
      }
      if [ -e "$path/.git" ]; then
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
    # Checkout/reset to the fetched tip.
    # Suppress "unable to rmdir <nested-submodule-dir>" warnings — those directories
    # contain nested submodule checkouts that git reset cannot remove; the
    # `git submodule update --init --recursive` step below re-initialises them correctly.
    git -C "$path" checkout -B "$branch" "origin/$branch" 2>/dev/null || git -C "$path" checkout "$branch" || true
    git -C "$path" reset --hard "origin/$branch" 2>/dev/null | grep -v "^warning: unable to rmdir" || true
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

printf '  → Current submodule status (variant-active only):\n'
# Filter status to only the submodules that this variant actually manages; skipped ones
# (e.g. variant-exclusive sources) just add noise to the output.
if [ -n "$ALLOWED_SUBMODULES_LIST" ]; then
  git submodule status --recursive 2>/dev/null | while IFS= read -r _line; do
    _spath=$(printf '%s' "$_line" | awk '{print $2}')
    # Always show nested submodules (paths with more than one component under sources/)
    _top="${_spath%%/*}/${_spath#*/}"
    _top="${_top%%/*}"  # "sources/<name>"
    if printf '%s\n' "$ALLOWED_SUBMODULES_LIST" | grep -qxF "$_top"; then
      printf '%s\n' "$_line"
    fi
  done || true
  unset _line _spath _top
else
  git submodule status --recursive || true
fi

# Remove stale SQLite auxiliary files before building the FTS index.
# A crashed previous build can leave orphaned -shm/-wal files behind; SQLite then
# tries to apply the old WAL against the freshly created empty database and fails
# with SQLITE_IOERR_SHORT_READ. Wipe them here as a belt-and-suspenders guard —
# build-fts.ts also does this, but the shell-level cleanup catches cases where
# tsc compilation is skipped or the script is interrupted mid-run.
_SQLITE_DB="dist/data/docs.sqlite"
for _ext in -shm -wal; do
  if [ -f "${_SQLITE_DB}${_ext}" ]; then
    printf '🧹 Removing stale %s%s (leftover from a previous failed build)...\n' "$_SQLITE_DB" "$_ext"
    rm -f "${_SQLITE_DB}${_ext}"
  fi
done
unset _SQLITE_DB _ext

# Build the search index (includes FTS5 and embedding index)
printf '🔍 Building search index (BM25 + embeddings)...\n'
npm run build

printf '✅ Setup complete!\n\n'

# Reload running PM2 processes so the server picks up the freshly built index
# without dropping active connections (pm2 reload = graceful rolling restart).
# Falls back to pm2 restart if reload is not available for that process.
# Reads PM2 process names from the variant config to stay in sync with ecosystem.config.cjs.
if command -v pm2 >/dev/null 2>&1; then
  _PM2_NAMES="$({
    node --input-type=module -e '
      import fs from "node:fs";
      import path from "node:path";
      const variant = (process.env.MCP_VARIANT || "").trim()
        || (fs.existsSync(path.resolve(process.cwd(), ".mcp-variant"))
            ? fs.readFileSync(path.resolve(process.cwd(), ".mcp-variant"), "utf8").trim()
            : "")
        || "sap-docs";
      const configPath = path.resolve(process.cwd(), "config", "variants", `${variant}.json`);
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.server?.pm2HttpName)        console.log(config.server.pm2HttpName);
      if (config.server?.pm2StreamableName)  console.log(config.server.pm2StreamableName);
    ';
  } 2>/dev/null || true)"

  if [ -n "$_PM2_NAMES" ]; then
    printf '♻️  Reloading PM2 processes to apply new index...\n'
    while IFS= read -r _pm2_name; do
      # Guard: both conditions must hold before any pm2 command runs.
      # Keeping them in a single `if` means `pm2 reload` is unreachable when the
      # name is empty — preventing an accidental `pm2 reload` (no-arg) which would
      # reload every process on the system.
      if [ -n "$_pm2_name" ] && pm2 show "$_pm2_name" >/dev/null 2>&1; then
        printf '    • %s: reloading (graceful)...\n' "$_pm2_name"
        pm2 reload "$_pm2_name" --update-env \
          || { printf '    ! reload failed, falling back to restart\n'; pm2 restart "$_pm2_name" --update-env || true; }
      elif [ -n "$_pm2_name" ]; then
        printf '    • %s: not found in PM2 — start it with: pm2 start ecosystem.config.cjs\n' "$_pm2_name"
      fi
    done <<< "$_PM2_NAMES"
    unset _pm2_name
  fi
  unset _PM2_NAMES
else
  printf 'ℹ️  PM2 not detected — restart the server manually to apply the new index.\n'
fi

printf '\nTo start the MCP server:\n'
printf '  npm start\n\n'
printf 'To use in Cursor:\n'
printf '1. Open Cursor IDE\n'
printf '2. Go to Tools → Add MCP Server\n'
printf '3. Use command: npm start\n'
printf '4. Set working directory to: %s\n' "$(pwd)"

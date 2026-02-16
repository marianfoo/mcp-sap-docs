#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_SHA="${SOURCE_SHA:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
TARGET_REPO="${TARGET_REPO:-https://github.com/marianfoo/abap-mcp-server.git}"
DRY_RUN="${DRY_RUN:-0}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for sync-to-abap.sh"
  exit 1
fi

if [ -n "${ABAP_REPO_SYNC_TOKEN:-}" ] && [[ "$TARGET_REPO" == "https://github.com/"* ]]; then
  TARGET_REPO="https://x-access-token:${ABAP_REPO_SYNC_TOKEN}@${TARGET_REPO#https://}"
fi

TMP_DIR="$(mktemp -d)"
TARGET_DIR="$TMP_DIR/abap-mcp-server"
SYNC_EXCLUDE_FILE="$ROOT_DIR/sync/abap.sync-exclude"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Cloning target repository branch $TARGET_BRANCH"
git clone --depth 1 --branch "$TARGET_BRANCH" "$TARGET_REPO" "$TARGET_DIR"

echo "Syncing tracked upstream files into target"
declare -a EXCLUDE_PATTERNS=()
if [ -f "$SYNC_EXCLUDE_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    EXCLUDE_PATTERNS+=("$line")
  done < "$SYNC_EXCLUDE_FILE"
fi

should_exclude() {
  local rel="$1"
  local pattern
  for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    if [[ "$pattern" == */ ]]; then
      [[ "$rel" == "${pattern}"* ]] && return 0
    else
      [[ "$rel" == $pattern ]] && return 0
    fi
  done
  return 1
}

FILE_LIST="$TMP_DIR/upstream-files.txt"
> "$FILE_LIST"
while IFS= read -r -d '' relpath; do
  if ! should_exclude "$relpath"; then
    printf '%s\n' "$relpath" >> "$FILE_LIST"
  fi
done < <(git -C "$ROOT_DIR" ls-files -z)

sort -u "$FILE_LIST" -o "$FILE_LIST"

TARGET_TRACKED="$TMP_DIR/target-tracked.txt"
git -C "$TARGET_DIR" ls-files | sort -u > "$TARGET_TRACKED"

STALE_TRACKED="$TMP_DIR/stale-tracked.txt"
comm -23 "$TARGET_TRACKED" "$FILE_LIST" > "$STALE_TRACKED"
while IFS= read -r stale; do
  [ -z "$stale" ] && continue
  if ! should_exclude "$stale"; then
    rm -f "$TARGET_DIR/$stale"
  fi
done < "$STALE_TRACKED"

rsync -a --files-from="$FILE_LIST" "$ROOT_DIR/" "$TARGET_DIR/"

echo "Applying ABAP overlay"
if [ -d "$ROOT_DIR/sync/abap.overlay" ]; then
  rsync -a "$ROOT_DIR/sync/abap.overlay/" "$TARGET_DIR/"
fi

echo "Setting ABAP variant selector"
printf 'abap\n' > "$TARGET_DIR/.mcp-variant"

echo "Patching ABAP package identity"
node --input-type=module - "$TARGET_DIR" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const targetDir = process.argv[2];
if (!targetDir) {
  throw new Error('Target directory argument is required');
}

const packagePath = path.join(targetDir, 'package.json');
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.name = 'mcp-abap-community-server';
  pkg.description = 'ABAP/RAP-focused MCP server for ADT (Eclipse) - search documentation, lint code';
  pkg.homepage = 'https://github.com/marianfoo/abap-mcp-server#readme';
  pkg.repository = {
    type: 'git',
    url: 'https://github.com/marianfoo/abap-mcp-server.git'
  };
  pkg.bugs = {
    url: 'https://github.com/marianfoo/abap-mcp-server/issues'
  };
  pkg.bin = {
    'mcp-abap-community-server': 'dist/src/server.js'
  };
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

const packageLockPath = path.join(targetDir, 'package-lock.json');
if (fs.existsSync(packageLockPath)) {
  const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  lock.name = 'mcp-abap-community-server';
  if (lock.packages && lock.packages['']) {
    lock.packages[''].name = 'mcp-abap-community-server';
  }
  fs.writeFileSync(packageLockPath, JSON.stringify(lock, null, 2) + '\n');
}
NODE

cd "$TARGET_DIR"

if [ -z "$(git status --porcelain)" ]; then
  echo "No sync changes detected."
  exit 0
fi

git config user.email "${SYNC_GIT_EMAIL:-action@github.com}"
git config user.name "${SYNC_GIT_NAME:-github-actions[bot]}"

git add -A
git commit -m "sync: mcp-sap-docs ${SOURCE_SHA} -> abap variant [skip-sync]"

if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run enabled. Commit created locally but not pushed."
  git --no-pager show --stat --oneline HEAD
  exit 0
fi

echo "Pushing sync commit to $TARGET_BRANCH"
git push origin "$TARGET_BRANCH"

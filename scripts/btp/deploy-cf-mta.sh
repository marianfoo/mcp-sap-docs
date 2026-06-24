#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  cat <<'HELP'
Build and deploy the sap-docs MTA archive to the currently targeted CF org/space.

Environment:
  MTA_EXT   Optional MTA extension descriptor (default: mta-overrides.mtaext)

Examples:
  npm run btp:deploy:mta
  MTA_EXT=my-overrides.mtaext npm run btp:deploy:mta
HELP
  exit 0
fi

MTA_EXT="${MTA_EXT:-mta-overrides.mtaext}"

mbt build

MTAR="$(ls -t mta_archives/mcp-sap-docs-btp-cf_*.mtar | head -n 1)"
if [ -z "${MTAR}" ]; then
  echo "No MTAR archive found under mta_archives/." >&2
  exit 1
fi

if [ -f "${MTA_EXT}" ]; then
  cf deploy "${MTAR}" -e "${MTA_EXT}"
else
  cf deploy "${MTAR}"
fi

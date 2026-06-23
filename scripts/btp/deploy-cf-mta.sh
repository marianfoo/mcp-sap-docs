#!/usr/bin/env bash
set -euo pipefail

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

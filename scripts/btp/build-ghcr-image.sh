#!/usr/bin/env bash
set -euo pipefail

PUSH_IMAGE=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --push)
      PUSH_IMAGE=true
      ;;
    --no-embeddings)
      BUILD_EMBEDDINGS=false
      ;;
    --embeddings)
      BUILD_EMBEDDINGS=true
      ;;
    -h|--help)
      cat <<'HELP'
Build the sap-docs Cloud Foundry Docker image for GHCR.

Environment:
  GHCR_IMAGE          Image repository (default: ghcr.io/marianfoo/mcp-sap-docs)
  TAG                 Primary tag (default: sap-docs)
  DOCKER_PLATFORM     Docker platform (default: linux/amd64)
  BUILD_EMBEDDINGS    true|false (default: true)

Flags:
  --push              Push all generated tags after a successful build
  --no-embeddings     Build FTS-only image without semantic embeddings/model cache
  --embeddings        Build semantic embeddings and cache the model in the image
HELP
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/marianfoo/mcp-sap-docs}"
TAG="${TAG:-sap-docs}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
BUILD_EMBEDDINGS="${BUILD_EMBEDDINGS:-true}"

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
SHA_TAG="sap-docs-${GIT_SHA}"

echo "Building ${GHCR_IMAGE}:${TAG}"
echo "Also tagging ${GHCR_IMAGE}:${SHA_TAG}"
echo "Platform: ${DOCKER_PLATFORM}"
echo "Semantic embeddings: ${BUILD_EMBEDDINGS}"

docker build \
  --platform "${DOCKER_PLATFORM}" \
  --build-arg MCP_VARIANT=sap-docs \
  --build-arg BUILD_EMBEDDINGS="${BUILD_EMBEDDINGS}" \
  -t "${GHCR_IMAGE}:${TAG}" \
  -t "${GHCR_IMAGE}:${SHA_TAG}" \
  .

if [ "${PUSH_IMAGE}" = "true" ]; then
  docker push "${GHCR_IMAGE}:${TAG}"
  docker push "${GHCR_IMAGE}:${SHA_TAG}"
fi

# Multi-stage build for MCP SAP Docs/ABAP server variants
# Enables self-hosting behind a reverse proxy (Nginx, Traefik, Caddy, etc.)

# ============ Build Stage ============
FROM node:22-slim AS builder
ARG MCP_VARIANT=sap-docs
ENV MCP_VARIANT=${MCP_VARIANT}

# Install git (required for submodules)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Initialize git repo (needed for submodules in Docker context)
# and fetch submodules with shallow clone for speed
# Preserve .gitmodules by backing it up before git init
RUN if [ -f .gitmodules ]; then cp .gitmodules /tmp/.gitmodules.bak; fi && \
    printf '%s\n' "${MCP_VARIANT}" > .mcp-variant && \
    git init && \
    if [ -f /tmp/.gitmodules.bak ]; then mv /tmp/.gitmodules.bak .gitmodules; fi && \
    git config --global advice.detachedHead false && \
    git submodule sync --recursive && \
    SUBMODULE_PATHS="$(node --input-type=module -e 'import fs from \"node:fs\"; const v=(process.env.MCP_VARIANT||\"sap-docs\").trim(); const cfg=JSON.parse(fs.readFileSync(\"config/variants/\" + v + \".json\", \"utf8\")); console.log((cfg.submodulePaths||[]).join(\" \"));')" && \
    if [ -n "$SUBMODULE_PATHS" ]; then git submodule update --init --depth 1 --jobs 4 $SUBMODULE_PATHS; fi && \
    git submodule update --init --recursive --depth 1 --jobs 4

# Build TypeScript and FTS5 index
RUN npm run build

# ============ Production Stage ============
FROM node:22-slim AS production
ARG MCP_VARIANT=sap-docs
ENV MCP_VARIANT=${MCP_VARIANT}

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/sources ./sources
COPY --from=builder /app/config ./config
COPY --from=builder /app/.mcp-variant ./.mcp-variant

# Create non-root user for security
RUN useradd -r -u 1001 mcpuser && \
    chown -R mcpuser:mcpuser /app

USER mcpuser

# Expose common Streamable HTTP ports for both variants
EXPOSE 3122 3124

# Environment variables
ENV NODE_ENV=production
ENV MCP_PORT=3122
ENV MCP_HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const p=process.env.MCP_PORT||'3122'; fetch('http://localhost:'+p+'/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the streamable HTTP server
CMD ["npm", "run", "start:streamable"]

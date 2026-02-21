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

# Resolve variant-specific sources and clone them shallowly.
# We avoid `git submodule update <path>` because this container build runs in a fresh
# git repo that does not have gitlinks/index entries for those paths.
RUN printf '%s\n' "${MCP_VARIANT}" > .mcp-variant && \
    SUBMODULE_PATHS="$(node --input-type=module -e 'import fs from "node:fs"; const v=(process.env.MCP_VARIANT||"sap-docs").trim(); const cfg=JSON.parse(fs.readFileSync("config/variants/" + v + ".json", "utf8")); for (const p of (cfg.submodulePaths||[])) console.log(p);')" && \
    git config -f .gitmodules --get-regexp 'submodule\..*\.path' | while read -r key path; do \
      name="${key#submodule.}"; \
      name="${name%.path}"; \
      url="$(git config -f .gitmodules "submodule.${name}.url" || true)"; \
      branch="$(git config -f .gitmodules "submodule.${name}.branch" || echo main)"; \
      [ -z "$path" ] && continue; \
      [ -z "$url" ] && continue; \
      if [ -n "$SUBMODULE_PATHS" ]; then \
        case " $SUBMODULE_PATHS " in \
          *" $path "*) ;; \
          *) continue ;; \
        esac; \
      fi; \
      mkdir -p "$(dirname "$path")"; \
      GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch "$branch" "$url" "$path" || { \
        echo "clone failed for $path on branch $branch, retrying with master"; \
        GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch master "$url" "$path" || true; \
      }; \
    done && \
    for path in $SUBMODULE_PATHS; do \
      if [ -d "$path/.git" ]; then \
        git -C "$path" submodule update --init --recursive --depth 1 || true; \
      fi; \
    done

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

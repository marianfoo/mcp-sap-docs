# Multi-stage build for MCP SAP Docs/ABAP server variants
# Enables self-hosting behind a reverse proxy (Nginx, Traefik, Caddy, etc.)

# ============ Build Stage ============
FROM node:22-slim AS builder
ARG MCP_VARIANT=sap-docs
ARG BUILD_EMBEDDINGS=true
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
    SUBMODULE_PATHS="$(node --input-type=module -e 'import fs from "node:fs"; const v=(process.env.MCP_VARIANT||"sap-docs").trim(); const cfg=JSON.parse(fs.readFileSync("config/variants/" + v + ".json", "utf8")); process.stdout.write((cfg.submodulePaths||[]).join(" "));')" && \
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
      sparse="$(case "$path" in \
        sources/sapui5-docs)                 echo 'docs';; \
        sources/openui5)                     echo 'src';; \
        sources/wdi5)                        echo 'docs';; \
        sources/ui5-tooling)                 echo 'docs';; \
        sources/cloud-mta-build-tool)        echo 'docs';; \
        sources/ui5-webcomponents)           echo 'docs';; \
        sources/cloud-sdk)                   echo 'docs-js docs-java';; \
        sources/cloud-sdk-ai)                echo 'docs-js docs-java';; \
        sources/ui5-cc-spreadsheetimporter)  echo 'docs';; \
        sources/dsag-abap-leitfaden)         echo 'docs';; \
        sources/abap-docs)                   echo 'docs';; \
        sources/btp-cloud-platform)          echo 'docs';; \
        sources/sap-artificial-intelligence) echo 'docs';; \
        sources/terraform-provider-btp)      echo 'docs';; \
        sources/abap-atc-cr-cv-s4hc)         echo 'src';; \
        sources/architecture-center)         echo 'docs';; \
        *)                                   echo '';; \
      esac)"; \
      if [ -n "$sparse" ]; then \
        _cb="$branch"; \
        GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --no-checkout --branch "$_cb" "$url" "$path" || { \
          echo "clone failed for $path on $branch, retrying with master"; \
          _cb="master"; \
          GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --no-checkout --branch "$_cb" "$url" "$path" || true; \
        }; \
        if [ -d "$path/.git" ]; then \
          git -C "$path" sparse-checkout init --cone; \
          git -C "$path" sparse-checkout set $sparse; \
          GIT_LFS_SKIP_SMUDGE=1 git -C "$path" checkout "$_cb" || true; \
        fi; \
      else \
        GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch "$branch" "$url" "$path" || { \
          echo "clone failed for $path on branch $branch, retrying with master"; \
          GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-tags --single-branch --depth 1 --branch master "$url" "$path" || true; \
        }; \
      fi; \
    done && \
    for path in $SUBMODULE_PATHS; do \
      if [ -d "$path/.git" ]; then \
        git -C "$path" submodule update --init --recursive --depth 1 || true; \
      fi; \
    done

# Download setup-time auxiliary datasets for variant-enabled tools. The
# ui5_version_diff runtime reads only the local bundle produced here.
RUN UI5_LIB_DIFF_ENABLED="$(node --input-type=module -e ' \
      import fs from "node:fs"; \
      const variant = (process.env.MCP_VARIANT || "sap-docs").trim(); \
      const config = JSON.parse(fs.readFileSync(`config/variants/${variant}.json`, "utf8")); \
      console.log(config.tools?.ui5LibDiff ? "true" : "false"); \
    ')" && \
    if [ "$UI5_LIB_DIFF_ENABLED" = "true" ]; then \
      npm run download:ui5-lib-diff; \
    fi

# Build TypeScript and the local search corpus. Semantic embeddings are useful
# for query quality, but can be disabled for a smaller/faster CF image.
RUN if [ "$BUILD_EMBEDDINGS" = "false" ]; then \
      npm run build:fts-only; \
    else \
      npm run build; \
    fi && \
    node -e "const Database=require('better-sqlite3'); const db=new Database('dist/data/docs.sqlite',{readonly:true}); const row=db.prepare('SELECT count(*) AS n FROM docs').get(); db.close(); if (!row || row.n <= 0) { throw new Error('Docker build produced an empty FTS index'); } console.log('Docker FTS index rows:', row.n);"

# Runtime fetches need source files, not git history. The UI5 TypeScript source
# indexes only root markdown files, so remove the generated site payload.
RUN find sources -name .git -type d -prune -exec rm -rf {} + && \
    if [ -d sources/ui5-typescript ]; then \
      find sources/ui5-typescript -mindepth 1 -maxdepth 1 ! -name '*.md' -exec rm -rf {} +; \
    fi

# ============ Production Stage ============
FROM node:22-slim AS production
ARG MCP_VARIANT=sap-docs
ARG BUILD_EMBEDDINGS=true
ENV MCP_VARIANT=${MCP_VARIANT}
LABEL org.opencontainers.image.source="https://github.com/marianfoo/mcp-sap-docs"

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev
RUN if [ "$BUILD_EMBEDDINGS" = "false" ]; then \
      rm -rf \
        node_modules/@huggingface \
        node_modules/@img \
        node_modules/onnxruntime-common \
        node_modules/onnxruntime-node \
        node_modules/onnxruntime-web \
        node_modules/sharp; \
    fi

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/sources ./sources
COPY --from=builder /app/config ./config
COPY --from=builder /app/src/metadata.json ./src/metadata.json
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
ENV MCP_PRELOAD_EMBEDDINGS=${BUILD_EMBEDDINGS}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const p=process.env.PORT||process.env.MCP_PORT||'3122'; fetch('http://localhost:'+p+'/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the streamable HTTP server
CMD ["npm", "run", "start:streamable"]

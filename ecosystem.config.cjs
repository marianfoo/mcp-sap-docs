const fs = require("node:fs");
const path = require("node:path");

function getVariantName() {
  if (process.env.MCP_VARIANT && process.env.MCP_VARIANT.trim()) {
    return process.env.MCP_VARIANT.trim();
  }

  const selectorPath = path.resolve(__dirname, ".mcp-variant");
  if (fs.existsSync(selectorPath)) {
    const selected = fs.readFileSync(selectorPath, "utf8").trim();
    if (selected) {
      return selected;
    }
  }

  return "sap-docs";
}

function getVariantConfig() {
  const variantName = getVariantName();
  const variantPath = path.resolve(__dirname, "config", "variants", `${variantName}.json`);

  if (!fs.existsSync(variantPath)) {
    throw new Error(`Missing variant config at ${variantPath}`);
  }

  return JSON.parse(fs.readFileSync(variantPath, "utf8"));
}

const variant = getVariantConfig();
const deployPath = process.env.MCP_DEPLOY_PATH || variant.server.deployPath;
const logPrefix = variant.server.pm2HttpName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

module.exports = {
  apps: [
    {
      name: variant.server.pm2HttpName,
      script: "node",
      args: [`${deployPath}/dist/src/http-server.js`],
      cwd: deployPath,
      env: {
        NODE_ENV: "production",
        MCP_VARIANT: variant.id,
        PORT: String(variant.server.httpStatusPort),
        LOG_LEVEL: "DEBUG",
        LOG_FORMAT: "json",
        RETURN_K: "30"
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      log_file: `/opt/mcp-sap/logs/${logPrefix}-http-combined.log`,
      out_file: `/opt/mcp-sap/logs/${logPrefix}-http-out.log`,
      error_file: `/opt/mcp-sap/logs/${logPrefix}-http-error.log`,
      log_type: "json",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      compress: true
    },
    {
      name: variant.server.pm2StreamableName,
      script: "node",
      args: [`${deployPath}/dist/src/streamable-http-server.js`],
      cwd: deployPath,
      env: {
        NODE_ENV: "production",
        MCP_VARIANT: variant.id,
        MCP_PORT: String(variant.server.streamablePort),
        LOG_LEVEL: "DEBUG",
        LOG_FORMAT: "json",
        RETURN_K: "30"
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      log_file: `/opt/mcp-sap/logs/${logPrefix}-streamable-combined.log`,
      out_file: `/opt/mcp-sap/logs/${logPrefix}-streamable-out.log`,
      error_file: `/opt/mcp-sap/logs/${logPrefix}-streamable-error.log`,
      log_type: "json",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      compress: true
    }
  ]
};

#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function printHelp() {
  console.log(`Build and deploy the sap-docs MTA archive to the current CF target.

Environment:
  MTA_EXT   Optional MTA extension descriptor (default: mta-overrides.mtaext)

Examples:
  npm run btp:deploy:mta
  MTA_EXT=my-overrides.mtaext npm run btp:deploy:mta
  $env:MTA_EXT="my-overrides.mtaext"; npm run btp:deploy:mta
`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function newestMtar() {
  const archiveDir = "mta_archives";
  if (!existsSync(archiveDir)) {
    return null;
  }

  return readdirSync(archiveDir)
    .filter((file) => /^mcp-sap-docs-btp-cf_.*\.mtar$/.test(file))
    .map((file) => {
      const path = join(archiveDir, file);
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null;
}

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

const mtaExt = process.env.MTA_EXT || "mta-overrides.mtaext";

run("mbt", ["build"]);

const mtar = newestMtar();
if (!mtar) {
  console.error("No MTAR archive found under mta_archives/.");
  process.exit(1);
}

console.log(`Deploying ${mtar}`);
if (existsSync(mtaExt)) {
  run("cf", ["deploy", mtar, "-e", mtaExt]);
} else {
  console.warn(`Extension descriptor ${mtaExt} not found; deploying without -e.`);
  run("cf", ["deploy", mtar]);
}

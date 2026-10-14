import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("syncs changed content despite equal sizes and timestamps, preserving overlays and exclusions", () => {
  const directory = mkdtempSync(join(tmpdir(), "abap-sync-"));
  temporaryDirectories.push(directory);
  const upstream = join(directory, "upstream");
  const seed = join(directory, "seed");
  const remote = join(directory, "target.git");
  const template = join(directory, "template");
  const timestamp = new Date("2020-01-01T00:00:00Z");
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (root: string, path: string, content: string) => {
    const file = join(root, path);
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, content);
    utimesSync(file, timestamp, timestamp);
  };
  for (const repo of [upstream, seed]) {
    mkdirSync(repo);
    git(repo, "init", "--initial-branch=main");
    git(repo, "config", "user.name", "Sync Test");
    git(repo, "config", "user.email", "sync-test@example.invalid");
  }

  write(seed, "src/streamable-http-server.ts", 'const VERSION = "0.3.55";\n');
  write(seed, "src/flavor.ts", 'const FLAVOR = "BASE55";\n');
  write(seed, ".github/workflows/deploy.yml", "keep ABAP deployment\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "Old mirror");
  git(directory, "clone", "--bare", seed, remote);

  write(upstream, "src/streamable-http-server.ts", 'const VERSION = "0.3.56";\n');
  write(upstream, "src/flavor.ts", 'const FLAVOR = "BASE56";\n');
  write(upstream, "sync/abap.overlay/src/flavor.ts", 'const FLAVOR = "ABAP56";\n');
  write(upstream, "sync/abap.sync-exclude", ".git\nsync/\n.github/workflows/*\n");
  write(upstream, ".github/workflows/deploy.yml", "upstream deployment\n");
  write(upstream, "package.json", JSON.stringify({ name: "mcp-sap-docs", version: "0.3.56" }));
  mkdirSync(join(upstream, "scripts"));
  copyFileSync(resolve("scripts/sync-to-abap.sh"), join(upstream, "scripts/sync-to-abap.sh"));
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "New upstream");

  // Fresh clones can have equal checkout timestamps. Make that collision
  // deterministic without depending on the speed of the test machine.
  write(template, "hooks/post-checkout", "#!/bin/sh\ngit ls-files -z | TZ=UTC xargs -0 touch -t 202001010000.00\n");
  chmodSync(join(template, "hooks/post-checkout"), 0o755);
  const runSync = () => execFileSync("bash", [join(upstream, "scripts/sync-to-abap.sh")], {
    cwd: upstream,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_TEMPLATE_DIR: template,
      TARGET_REPO: pathToFileURL(remote).href,
      TARGET_BRANCH: "main",
      DRY_RUN: "0",
    },
  });

  runSync();
  expect(git(remote, "show", "main:src/streamable-http-server.ts")).toBe('const VERSION = "0.3.56";');
  expect(git(remote, "show", "main:src/flavor.ts")).toBe('const FLAVOR = "ABAP56";');
  expect(git(remote, "show", "main:.github/workflows/deploy.yml")).toBe("keep ABAP deployment");
  expect(JSON.parse(git(remote, "show", "main:package.json"))).toMatchObject({
    name: "mcp-abap-community-server", version: "0.3.56",
  });
  expect(git(remote, "show", "main:.mcp-variant")).toBe("abap");
  const firstCommit = git(remote, "rev-parse", "main");
  expect(runSync()).toContain("No sync changes detected.");
  expect(git(remote, "rev-parse", "main")).toBe(firstCommit);
}, 20_000);

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeOpenUxGeneratedSources, OpenUxGeneratedSource } from "../scripts/materialize-openux-generated.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("Open UX generated source materializer", () => {
  it("splits chunks into small markdown files with pinned GitHub line URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openux-materializer-"));
    tempDirs.push(root);

    const dataLocalDir = path.join(root, "data_local");
    const outputRoot = path.join(root, "generated");
    await mkdir(dataLocalDir, { recursive: true });

    const source: OpenUxGeneratedSource = {
      libraryId: "/sap-fe-test-api",
      outputDir: "sap-fe-test-api",
      inputFiles: ["sap_fe_test_api.md"],
      defaultTags: ["sap.fe.test", "opa5"]
    };

    await writeFile(
      path.join(dataLocalDir, "sap_fe_test_api.md"),
      [
        "--------------------------------",
        "",
        "**TITLE**: First Chunk",
        "",
        "**INTRODUCTION**: Intro one",
        "",
        "body one",
        "--------------------------------",
        "",
        "# Second Chunk",
        "",
        "body two",
        "--------------------------------"
      ].join("\n")
    );

    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const result = await materializeOpenUxGeneratedSources({
      dataLocalDir,
      outputRoot,
      commitSha,
      sources: [source]
    });

    expect(result).toEqual({ filesWritten: 2, chunksWritten: 2 });

    const files = (await readdir(path.join(outputRoot, "sap-fe-test-api"))).sort();
    expect(files).toHaveLength(2);

    const first = await readFile(path.join(outputRoot, "sap-fe-test-api", files[0]), "utf8");
    expect(first).toContain('title: "First Chunk"');
    expect(first).toContain("**URL:** https://github.com/SAP/open-ux-tools/blob/0123456789abcdef0123456789abcdef01234567/packages/fiori-docs-embeddings/data_local/sap_fe_test_api.md#L3-L7");
    expect(first).toContain("**Open UX Library:** /sap-fe-test-api");

    const second = await readFile(path.join(outputRoot, "sap-fe-test-api", files[1]), "utf8");
    expect(second).toContain('title: "Second Chunk"');
    expect(second).toContain("**URL:** https://github.com/SAP/open-ux-tools/blob/0123456789abcdef0123456789abcdef01234567/packages/fiori-docs-embeddings/data_local/sap_fe_test_api.md#L10-L12");
  });
});

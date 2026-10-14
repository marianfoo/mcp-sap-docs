import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeOpenUxGeneratedSources, OPENUX_GENERATED_SOURCES, OpenUxGeneratedSource } from "../scripts/materialize-openux-generated.js";

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

  it("materializes the replacement OPA5 skill documents with valid nested source URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openux-opa5-"));
    tempDirs.push(root);
    const dataLocalDir = path.join(root, "data_local");
    const outputRoot = path.join(root, "generated");
    const inputDir = "skills_copy/sap-fiori-opa5-test-development";
    const inputFiles = [
      "SKILL.md",
      "fiori-elements-v2-test-library.md",
      "v2-instructions.md",
      "v4-custom-selectors.md",
      "v4-instructions.md",
      "v4-journeyrunner.md",
      "v4-sap-fe-test-api-guide.md",
      "v4-standard-patterns.md"
    ];
    await mkdir(path.join(dataLocalDir, inputDir), { recursive: true });
    for (const file of inputFiles) {
      await writeFile(path.join(dataLocalDir, inputDir, file), `# ${file}\n\nOPA5 guidance\n`);
    }

    const source = OPENUX_GENERATED_SOURCES.find((item) => item.libraryId === "/fiori-opa5-docu")!;
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const result = await materializeOpenUxGeneratedSources({ dataLocalDir, outputRoot, commitSha, sources: [source] });
    expect(result).toEqual({ filesWritten: 8, chunksWritten: 8 });

    const files = await readdir(path.join(outputRoot, source.outputDir));
    const documents = await Promise.all(files.map((file) => readFile(path.join(outputRoot, source.outputDir, file), "utf8")));
    for (const inputFile of inputFiles) {
      expect(documents.some((document) => document.includes(
        `**URL:** https://github.com/SAP/open-ux-tools/blob/${commitSha}/packages/fiori-docs-embeddings/data_local/${inputDir}/${inputFile}#L1-L3`
      ))).toBe(true);
    }
  });

  it("fails when a configured input is missing instead of publishing an incomplete library", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openux-missing-"));
    tempDirs.push(root);
    await expect(materializeOpenUxGeneratedSources({
      dataLocalDir: root,
      outputRoot: path.join(root, "generated"),
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      sources: [{ libraryId: "/example", outputDir: "example", inputFiles: ["missing.md"], defaultTags: [] }]
    })).rejects.toMatchObject({ code: "ENOENT" });
  });


  it.each(["---", "--------------------------------"])("uses section headings outside code and skips skill frontmatter (%s)", async (delimiter) => {
    const root = await mkdtemp(path.join(tmpdir(), "openux-skill-"));
    tempDirs.push(root);
    const dataLocalDir = path.join(root, "data_local");
    const outputRoot = path.join(root, "generated");
    const inputFile = "skills_copy/opa5/SKILL.md";
    await mkdir(path.dirname(path.join(dataLocalDir, inputFile)), { recursive: true });
    // Mirrors upstream SKILL.md metadata/sections and the API guide's fenced bash comment.
    await writeFile(path.join(dataLocalDir, inputFile), [
      delimiter,
      "name: sap-fiori-opa5-test-development",
      "description: OPA5 integration test guidance",
      delimiter,
      "",
      "# SAP Fiori OPA5 Development Skill",
      "",
      "A guide for integration tests.",
      "--------------------------------",
      "",
      "## Prerequisites",
      "An existing application is required.",
      "--------------------------------",
      "```bash",
      "# Download the API JSON",
      "```",
      "",
      "### API Reference",
      "Read the API guide.",
      "--------------------------------",
      "A paragraph without a heading."
    ].join("\n"));
    const result = await materializeOpenUxGeneratedSources({
      dataLocalDir, outputRoot,
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      sources: [{ libraryId: "/fiori-opa5-docu", outputDir: "opa5", inputFiles: [inputFile], defaultTags: [] }]
    });
    expect(result.filesWritten).toBe(4);
    const files = (await readdir(path.join(outputRoot, "opa5"))).sort();
    expect(files.every((file) => !file.includes("skillscopy") && file.length < 90)).toBe(true);
    const documents = await Promise.all(files.map((file) => readFile(path.join(outputRoot, "opa5", file), "utf8")));
    expect(documents[0]).toContain('title: "SAP Fiori OPA5 Development Skill"');
    expect(documents[0]).toContain("/SKILL.md#L6-L8");
    expect(documents[1]).toContain('title: "SAP Fiori OPA5 Development Skill: Prerequisites"');
    expect(documents[1]).toContain("/SKILL.md#L11-L12");
    expect(documents[2]).toContain('title: "SAP Fiori OPA5 Development Skill: API Reference"');
    expect(documents[2]).toContain("\n# SAP Fiori OPA5 Development Skill: API Reference\n");
    expect(documents[2]).toContain("/SKILL.md#L14-L19");
    expect(documents[3]).toContain('title: "SKILL 4"');
    expect(documents.join("\n")).not.toContain("name: sap-fiori-opa5-test-development");
  });

});

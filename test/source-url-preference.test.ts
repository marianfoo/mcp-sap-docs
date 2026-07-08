import { describe, expect, it } from "vitest";
import { chooseSourceAwareUrl } from "../src/lib/sourceContent.js";

describe("source-aware URL preference", () => {
  it("prefers embedded source URLs over generated metadata URLs", () => {
    const sourceContent = [
      "# Generated chunk",
      "",
      "**URL:** https://github.com/SAP/open-ux-tools/blob/0123456789abcdef0123456789abcdef01234567/packages/fiori-docs-embeddings/data_local/sap_fe_test_api.md#L3-L7"
    ].join("\n");

    expect(
      chooseSourceAwareUrl(
        sourceContent,
        "https://github.com/SAP/open-ux-tools/blob/generated-fallback",
        "https://example.com/search-path",
        "/sap-fe-test-api/first"
      )
    ).toBe("https://github.com/SAP/open-ux-tools/blob/0123456789abcdef0123456789abcdef01234567/packages/fiori-docs-embeddings/data_local/sap_fe_test_api.md#L3-L7");
  });

  it("falls back to generated URLs, result paths, then local anchors", () => {
    expect(chooseSourceAwareUrl("# No URL", "https://example.com/generated", undefined, "/id")).toBe("https://example.com/generated");
    expect(chooseSourceAwareUrl("# No URL", null, "https://example.com/path", "/id")).toBe("https://example.com/path");
    expect(chooseSourceAwareUrl("# No URL", null, undefined, "/id")).toBe("#/id");
  });

  it("does not treat application config url fields as source provenance", () => {
    const configContent = [
      'specVersion: "3.0"',
      "server:",
      "  customMiddleware:",
      "    - name: fiori-tools-proxy",
      "      configuration:",
      "        backend:",
      "          - url: https://sapes5.sapdevcenter.com"
    ].join("\n");

    expect(
      chooseSourceAwareUrl(
        configContent,
        "https://github.com/SAP-samples/fiori-tools-samples/blob/main/ui5-local.yaml?plain=1",
        undefined,
        "/id"
      )
    ).toBe("https://github.com/SAP-samples/fiori-tools-samples/blob/main/ui5-local.yaml?plain=1");
  });
});

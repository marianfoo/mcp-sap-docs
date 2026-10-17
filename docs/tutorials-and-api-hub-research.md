# SAP tutorials and Business Accelerator Hub: recommended next sources

Research date: 2026-10-17. These are follow-up recommendations; the source expansion in this PR adds the previously recommended documentation repositories.

## SAP tutorials

The tutorial repository contains 704 tutorial Markdown files. The current MCP configuration indexes one Fiori OPA testing tutorial. I inspected 46 additional candidate tutorials, their Markdown and code examples, and their latest file commits. A recent commit alone does not establish that every example is current.

### Recommended first selection: 32 tutorials

| Group | Exact selection | Why it is useful |
|---|---|---|
| AI Core: 6 | `ai-core-orchestration-consumption-v2`, `ai-core-orchestration-grounding-v2`, `ai-core-genaihub-prompt-registry`, `ai-core-genaihub-evaluation-with-grounding`, `ai-core-genaihub-inference-observability`, `ai-core-genaihub-batch-consumption` | Practical consumption, grounding, evaluation, prompt management, observability, and batch workflows. Complements the new Python SDK reference. |
| Integration Suite MCP Gateway: 1 | `btp-integration-suite-mcp-gateway` | Turn a ServiceNow API into an MCP server, apply policies, publish it in Developer Hub, and test streamable HTTP with MCP Inspector. Directly relevant to this project's users and the new Integration Suite reference. |
| HANA Cloud SQLScript: 10 | `hana-cloud-sqlscript-anonymous`, `-debugging`, `-libraries`, `-parallel`, `-scalar`, `-stored-proc`, `-table-operators`, `-table-user`, `-table-var`, `-usingindexbased` (all use the same `hana-cloud-sqlscript` prefix) | Procedures, functions, debugging, table variables, and SQLScript behavior. Fills a gap between general CAP/ABAP guidance and HANA implementation. |
| CAP with HANA Cloud: 7 | `hana-cloud-cap-create-project`, `-create-database-cds`, `-calc-view`, `-stored-proc`, `-create-ui`, `-add-authentication`, `-deploy-mta` (same `hana-cloud-cap` prefix) | A coherent development path, including calculation views and exposing stored procedures through CAP. |
| Integration Suite transport: 8 | `btp-transport-management-cpi-01-use-case` through `-08-cas-ui`, including source/target setup, connections, destination, enabling transport, and a test transport | Connects Integration Suite, Content Agent, destinations, and Cloud Transport Management in one worked scenario. |

Examples inspected: [orchestration V2 consumption](https://developers.sap.com/tutorials/ai-core-orchestration-consumption-v2.html), [orchestration V2 grounding](https://developers.sap.com/tutorials/ai-core-orchestration-grounding-v2.html), [SQLScript procedures](https://developers.sap.com/tutorials/hana-cloud-sqlscript-stored-proc.html), [CAP authentication](https://developers.sap.com/tutorials/hana-cloud-cap-add-authentication.html), [transport scenario source](https://github.com/sap-tutorials/Tutorials/blob/master/tutorials/btp-transport-management-cpi-01-use-case/btp-transport-management-cpi-01-use-case.md).

The transport overview's derived Developer Center URL returned HTTP 404, while tutorials 02–08 returned HTTP 200. Its source remains in the official repository. Use the verified GitHub source link for that overview and check published URLs individually during ingestion.

Most selected HANA files were updated in August–October 2026. The transport chain has updates from June/August 2025 through October 2026. Selected AI tutorials have updates from October 2025 through August 2026. These are file commit dates, not evidence that the examples were executed against a tenant during this research.

The [MCP Gateway tutorial](https://developers.sap.com/tutorials/btp-integration-suite-mcp-gateway.html) was updated on October 6, 2026. It requires Integration Cell and a ServiceNow trial. Preserve its edition prerequisites: the introduction names Premium or Enhanced Edition for productive use, while Step 1 names Enhanced Edition specifically. Verify the entitlement for the target tenant before execution. I reviewed the Markdown, OpenAPI operations, OAuth token commands, and MCP client steps; I did not provision these services or execute the tutorial.

### Second selection: 11 tutorials

- Four `fiori-tools-cap-*` tutorials: environment preparation, application generation, list report, and object page. Useful, but overlaps existing CAP/Fiori tools guidance.
- Six `cap-operator-01-*` through `cap-operator-06-*` tutorials: a complete Kyma/CAP Operator multitenancy deployment sequence. Useful for that audience; preserve prerequisites and treat printed CLI version output as illustrative, not a current version requirement.
- `cp-cf-create-destination`: a small practical cockpit walkthrough, complementary to the new Connectivity reference.

### Defer these three inspected tutorials

1. **`ai-core-orchestration-consumption-opt-v2`** still contains `masking_providers` in Python, raw JSON, and JavaScript examples. SAP documents its replacement by `providers`; removal was scheduled for **2026-09-15**, so these examples may already fail. Recheck and correct upstream before promoting this tutorial. This is a concrete compatibility concern despite the V2 title and June 2026 update. [Tutorial](https://github.com/sap-tutorials/Tutorials/blob/master/tutorials/ai-core-orchestration-consumption-opt-v2/ai-core-orchestration-consumption-opt-v2.md), [official change log](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/what-s-new-for-sap-ai-core).
2. **`ai-core-genai-hana-vector`** was last changed in September 2024 and installs the older `generative-ai-hub-sdk` package. Prefer the current grounding V2 tutorial and SDK references; validate/update this older RAG example separately.
3. **`cap-soap-service`** was last changed in November 2022 and uses old API Hub navigation. The use case is worthwhile, but its package/API usage and instructions need a focused compatibility check first.

Also prefer V2 over old orchestration tutorials. SAP scheduled the original orchestration endpoint for decommissioning on **2026-10-31**. This date applies to orchestration V1; it does not mean unrelated endpoints such as batch `/v1/chat/completions` are deprecated. [Official change log](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/what-s-new-for-sap-ai-core).

### Simple ingestion plan

Use an explicit file-pattern allowlist in the existing tutorial repository, grouped into AI, HANA, and integration tutorial bundles. Keep the existing OPA guide. Align sparse paths in setup and Docker, and cite each original tutorial. Do not automatically include every folder matching a broad AI prefix.

The source uses ordinary Markdown plus tutorial controls such as `[OPTION BEGIN]` and some older accordion markers. Preserve headings, code fences, option labels, and prerequisite links; verify readability before considering any small markup cleanup. Keep tutorial examples distinguishable from product reference material. Validate the new queries and fetched code blocks before expanding the allowlist.

## Business Accelerator Hub

### What was verified live

These were read-only metadata/specification requests. No business API operations were executed.

| Artifact | Verified content | Value |
|---|---|---|
| [Business Partner A2X](https://api.sap.com/api/API_BUSINESS_PARTNER/overview) | API metadata; 203 paths / 440 operations; OpenAPI JSON about 1.92 MB; EDMX about 550 KB | Exact entities, operations, keys, payload schemas, and CAP external-service imports. |
| [Integration Content](https://api.sap.com/api/IntegrationContent/overview) | API metadata and 125 operations | Integration Suite artifact deployment/management automation. |
| [S/4HANA Sales Order Events](https://api.sap.com/event/OP_SALESORDEREVENTS/overview) | Event metadata and an approximately 119 KB JSON specification | Event channels, messages, and consumer payloads. |
| [I_BusinessPartner](https://api.sap.com/cdsviews/I_BUSINESSPARTNER) | 95 fields, types, release/extensibility metadata, linked documentation, JSON definition | A useful extension to the existing released-object tools, which focus on release state rather than field-level documentation. |
| `PCE_SD_SOR_AUTO_XTRCTN_MODIFY` | Released BAdI metadata and description: Modification for Sales Order Request Data | Discover relevant extension points and follow their documentation. Public/private edition must remain explicit. |

AI Core (`AI_CORE_API`) was also found through live search; it is a useful next API to evaluate alongside Integration Content. Searching broadly for “Sales Order” returned an event from SAP Advanced Therapy Orchestration as well as S/4HANA. Therefore title alone is not enough to choose an artifact.

### Priority

1. **APIs:** exact IDs plus product-scoped discovery, selected operations, parameters, request/response schemas, and authentication metadata. Start with S/4HANA Business Partner and Integration Suite Integration Content; then evaluate Sales Order, Product, and AI Core.
2. **CDS views:** fields, types, release status, extensibility, and official links. Distinguish cloud and private-edition artifacts rather than treating similar technical names as interchangeable.
3. **Events:** channels, message schemas, operation direction, and product/release context.
4. **BAdIs and business object interfaces:** discovery and descriptions first, followed by detailed documentation where actually available. The BAdI response inspected does not establish that every artifact includes executable examples or full interface definitions.
5. **Adapters, partner use cases, and process blueprints:** useful later for solution selection, but less direct coding value and more varied source/vendor/format handling.

### Recommended integration approach

The lowest-impact option is to use the existing **`sap-api-hub-mcp` alongside MCP SAP Docs**. It already implements search, metadata, resources, and specifications in [sap-mcp-servers/packages/api-hub](https://github.com/marianfoo/sap-mcp-servers/tree/main/packages/api-hub). This was the connection used for the live checks. It handles SAP login and cached session cookies; successful connected calls do not establish anonymous access.

If one MCP SAP Docs endpoint is required, add an **optional online provider** that reuses that client and requires the user's Hub authentication. Keep the public documentation service usable without Hub credentials. An independent bulk catalog or a second login implementation would add maintenance with little additional value.

Return compact search hits with artifact ID, kind, product/package, release/version, lifecycle state, and source URL. Fetch a selected artifact's normalized metadata and resource summary. Retrieve full OpenAPI/EDMX/event definitions explicitly when needed. Use a short cache keyed by artifact kind, ID, product/release where relevant, and requested format.

The Business Partner specification alone is almost two megabytes. Returning it for every documentation question or embedding all API operations by default would add substantial irrelevant context. Operation-level selection provides better value.

### Findings to account for

- Category aggregates exposed approximately 5,535 APIs, 518 events, 19,619 CDS views, and 3,258 BAdIs. These are upstream catalog counts, not unique business capabilities or a verified crawl total.
- The category response's top-level artifact total was zero while nested type aggregates were populated. Read and validate the type-level data; do not interpret zero as an empty catalog.
- The default `Sales_Order` event response selected version 1.0.0 even though its version list included 1.0.1. Resolve an explicit product/release and record the effective version. “Default” cannot be assumed to mean newest.
- Some normalized fields were empty while useful data existed elsewhere: the CDS view had 95 fields but empty capability/business-context lists, and the Integration Content summary listed no authentication methods. Missing metadata is unknown, not proof of no capability or no authentication.
- Package responses include documentation and license links. Read-only retrieval through the connected Hub MCP succeeded for the sampled artifacts, but this does not establish blanket redistribution rights or anonymous access. Check the selected package's terms before shipping offline copies. The S/4HANA Cloud package explicitly distinguishes Public Edition from other editions.

## Decision

The best next tutorial expansion is the **32-file curated selection** above. For the Hub, the strongest addition is **targeted online API and CDS-view retrieval**, followed by events. The existing Markdown pipeline is sufficient for the tutorial work; Hub support merits a separate focused change with tests for version selection, missing metadata, large specifications, and API errors.

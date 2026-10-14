# Fix object identity lookup (#91)

## Problem

The loader prefers `tadirObject`/`tadirObjName` over `objectType`/`objectKey`.
A function module becomes its function group, and a BAdI becomes its enhancement
spot. Deduplication then merges distinct members of the same container. Successors
lose their identity in the same way.

The current SAP source and the public server reproduce this for
`FUNC:BAPI_COSTCENTER_GETDETAIL`. The regression fixture also includes two BAdIs
sharing an enhancement spot and a CDS successor, copied from SAP source commit
`4aeb6577fd0e9ef4c87309c55dc5c60974903671`.

## Small fix

1. Keep the complete actual type/name pair as `objectType`/`objectName`. Fall back
   to a complete TADIR pair only for legacy records without an actual identity.
   Preserve `tadirObject`/`tadirObjName` separately on objects and successors.
2. Deduplicate actual objects, not containers. Index TADIR aliases separately and
   accept both type filters and both names in searches. Exact actual detail lookup
   wins over a TADIR fallback. Keep the existing released-over-classic precedence.
3. Return each actual object once, including in counts and pagination. A TADIR
   container can have several members: searches return them all; detail fallback
   keeps the first preferred record for compatibility. Use an actual type/name
   pair to identify a specific member.
4. Update tool descriptions and run these regressions in PR CI.

## Verification

- First show failing regressions through the real JSON loader and search/details
  functions, rather than copying the normalization logic into tests.
- Check actual and TADIR lookup for FUNC, BADI_DEF and CDS_STOB, shared containers,
  successor enrichment, case-insensitive lookups, incomplete/legacy identities,
  released/classic duplicates, filters, compliance, counts and pagination.
- Run the targeted suite, TypeScript build and real-source integration checks for
  all four system types. Let full PR CI build the corpus and run integration tests.
- Obtain an independent Claude Opus 5.5 Max review of the final commit and fix
  actionable findings before merging. This change requires a subsequent release
  and ABAP sync to reach all installations.

## Local results

The initial production-loader regression run failed 16 of 32 cases. After the
fix, all 34 cases pass, including two additional successor/alias boundary cases.
All 37,030 public-cloud, 45,148 private-cloud and 7,067 BTP released records retain
their actual identity. Private-cloud/on-premise stores also include classic APIs
(53,346 unique objects each). All 11 real-source integration cases pass.

Real MCP stdio clients passed the three issue reproductions plus BAdI/CDS detail
lookups for both `sap-docs` and `abap` variants. Text and structured responses agree.
The real source also contains `BAPI_COSTCENTER_GETDETAIL1`; substring search returns
both matches, with the exact requested name first. This is expected search behavior.

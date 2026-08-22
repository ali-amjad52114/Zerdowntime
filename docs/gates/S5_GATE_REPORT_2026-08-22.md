# S5 independent gate report — 2026-08-22

## Decision

**REJECT / NOT RELEASE-READY.** G1, G2, and G4 fail. G3 live sponsor proof is not available. G5 passes only the disease/corpus/selection/multi-target display and restart-recovery portion; the complete browser flow cannot pass.

## S1 repair rerun

S5 reran the current working tree after S1's repair notification. The full suite now passes **226/226**, and the focused G1/G2 suite passes **30/30**. These results supersede the corresponding initial findings below:

- **CLEARED — HTTP human-selection bypass:** `/mend/discovery/handoff` now requires `CANDIDATES_SELECTED`, a nonempty saved selection, and a requested subset of that saved selection. A focused server test proves a direct handoff returns 400.
- **CLEARED — target-specific UI action:** every diligence target now renders its own `Analyze this target` button with `data-run-id` and sends `target_run_id`.
- **CLEARED — basic target-run API binding:** disease-first structure and compound POSTs require a known `target_run_id` and reject a mismatched target name. Results persist and can be fetched by target-run ID after restart.
- **CLEARED — disease handoff Y identity:** `runSelectedTargetDiligence` now resolves a reviewed-human UniProt accession and performs an exact-accession RCSB search. The focused test verifies EGFR resolves to P00533 and that the RCSB query is `exact_match` on P00533. This prevents recurrence of the MGMT/EGFR text-search false positives in the normal handoff path.
- **CLEARED — Port server adapter exists:** `/api/port/actions` is authenticated, idempotent, and has a deterministic server integration test for an evidence-derived candidate handoff.
- **CLEARED — Bright Data adapter is callable from X:** when explicitly configured, the handoff passes disease/candidate/target-run correlation to the acquisition adapter and merges validated records. The focused deterministic test passes.

The release decision remains **REJECT** because the following S1 blockers remain in the current tree:

1. **Historical runs are still deleted:** `targetRuns.clear()` and `diligenceWorkflows.clear()` remain in the new-discovery path (`src/server.mjs:461-462`). Current-run restart recovery is not durable run history.
2. **Target-level partial failure is still not isolated:** HTTP multi-target handoff still uses one `Promise.all` (`src/server.mjs:502`); a rejected target execution prevents all results from being committed.
3. **The advertised axes request is still ignored:** `body.axes` is not consumed by HTTP handoff, which always executes X/Y/Z.
4. **Run binding validates only the target name:** structure/compound endpoints do not verify request `disease` or `uniprot_id` against the bound run's disease and exact Y accession. A caller can bind an EGFR run ID to target `EGFR` while supplying a different UniProt accession.
5. **Analysis cache lookup remains globally keyed before run binding:** `analyzeTarget` checks target/UniProt cache keys, so two runs for the same target/accession can reuse a payload containing the earlier run's disease provenance before the server adds the new `target_run_id`.
6. **Direct Analyze still has unsafe text fallback:** if exact-accession RCSB returns no entries, `src/axes/y/analyze.mjs:247` still falls back to target text search without proving returned entries map to the resolved accession.
7. **Fixed AATD text remains visible:** the production discovery placeholder still says `e.g. Alpha-1 Antitrypsin Deficiency`.
8. **Pocket provenance remains incomplete in the UI:** `pockets_source` is not displayed, and the P2Rank version/mode is not recorded.
9. **Live gates remain open:** no Bright Data external run/snapshot proof, Port connected manual-action proof, or SigNoz exact-run logs/traces/metrics readback was produced. The earlier live browser Z timeout also remains unresolved.

Accordingly, the updated gate state is: **G1 FAIL** (fixed-target UI leakage), **G2 FAIL** (history, partial failure, canonical binding/cache), **G3 NOT_RUN live**, **G4 FAIL** (Analyze fallback and pocket/assay provenance), **G5 FAIL/partial**, **G6 BLOCKED**.

This is an independent audit of branch `master` beginning at commit `7109212`, including the S1 uncommitted working-tree changes visible during the audit. Sponsor commits present were `7109212` (SigNoz), `3b532f9` (Port), and `5da57d8` (Bright Data). The working tree was changing during the audit, so a final gate must be rerun against frozen commit hashes after owner repairs are integrated.

## Test evidence

- `npm test`: **PASS**, 221 tests passed, 0 failed, duration 5.91 seconds.
- Live local browser, `http://localhost:31877/mend`: disease-only Glioblastoma run collected 50 Europe PMC resources and rendered source-linked candidates, including contradictory passages.
- Browser selection: MGMT and EGFR were saved as two selected targets and received distinct run IDs, `discovery-mgmt-0e790760` and `discovery-egfr-6b1364cc`.
- Live X/Y/Z handoff: X and Y returned 25 records per target; both Z requests timed out after 45 seconds. Both target runs became `DEGRADED` / `BLOCKED`.
- Restart recovery: after stopping and restarting the Node service with the same `MEND_STATE_FILE`, Glioblastoma and both target results remained visible.
- `npm run signoz:mcp:smoke`: **NOT RUN successfully**; exited 1 because `SIGNOZ_URL` was unavailable to the process. No exact-run cloud readback proof was produced.
- No Port credentials or connected action evidence were available.
- No Bright Data target-run live artifact with an external provider run/snapshot ID was available.

## G1 — disease-only invariant: FAIL

| Criterion | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Discovery calls the corpus with disease only | PASS | `src/server.mjs` passes only `disease`, `maxPapers`, and `includeAnnotations` to `corpusDiscovery`; automated rejection test passes. | S1 |
| Caller-supplied target is rejected | PASS (bounded) | `src/server.mjs:235` rejects `target`, `targetId`, and `uniprot_id`; `test/mend-persistence.test.mjs` passes. | S1 |
| Two unrelated diseases are proven | NOT_RUN | One live unrelated disease (Glioblastoma) and deterministic test diseases were exercised. A second complete live disease flow was not required to establish the blockers below. | S5 rerun |
| No fixed AATD value leaks into the production discovery page | FAIL | The live disease-first page visibly renders placeholder `e.g. Alpha-1 Antitrypsin Deficiency` in `src/mend/discovery/ui.mjs`. This violates the gate's strict no-fixed-AATD-value requirement, even though result data did not leak. | S1 |
| Candidates originate in exact source evidence | PASS | Live Glioblastoma candidates link exact Europe PMC passages and URLs; deterministic discovery tests pass. | S1 |
| Contradictions remain visible | PASS | Live MGMT and ZIC3 cards displayed contradictory passages and source links. | S1 |
| Human selection is required before handoff | **FAIL** | `src/server.mjs:301` trusts `body.candidateIds` and does not require `discoveryState.status === CANDIDATES_SELECTED` or equality with the persisted selection. A client can call `/mend/discovery/handoff` directly with any known candidate ID and bypass `/select`. | S1 |

## G2 — target-run correctness and persistence: FAIL

| Criterion | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Multiple targets receive distinct X/Y/Z runs | PASS | Live MGMT and EGFR runs had distinct run IDs and independent axis records; deterministic persistence test passes. | S1 |
| Current target runs survive restart | PASS | Browser state recovered both target runs after service restart using the same state file. | S1 |
| Historical disease/run retention | FAIL | Starting a new discovery calls `targetRuns.clear()` and `diligenceWorkflows.clear()` at `src/server.mjs:267-268`; prior disease history is deleted from persisted state. | S1 |
| One target failure cannot abort all targets | FAIL | Handoff uses one `Promise.all` at `src/server.mjs:305`; a top-level rejection from any `targetDiligence` rejects the complete handoff and prevents partial successful results from being committed. Axis-level degradation happens to be caught lower down, but target-level partial failure is not isolated. | S1 |
| Structure analysis is bound to one target run | **FAIL** | `/target/analyze` accepts target/disease/accession with no `target_run_id` ownership check. The browser renders no per-target Analyze button; its global action uses `document.querySelector('[data-diligence-target]')` at `src/mend/discovery/ui.mjs:174`, always choosing the first result. | S1 |
| Structure/compound caches cannot cross target boundaries | FAIL | Analyses are keyed by PDB/UniProt and compounds by UniProt/target, not by `target_run_id`; cached payloads include target and disease provenance and can be reused outside a run boundary. | S1 |
| Requested axes are honored | FAIL | The browser sends `axes`, but the handoff server does not read `body.axes` and always runs X/Y/Z. | S1 |

## G3 — sponsor proof: NOT_RUN (integration blockers also present)

### Bright Data

- Deterministic adapter contract: **PASS**.
- Integrated into the selected-target Mend run: **FAIL**. There is no call from `src/server.mjs` or `src/mend/discovery/handoff.mjs` into `src/acquisition/brightdata-source.mjs`.
- Live G3 evidence: **NOT_RUN**. `docs/brightdata-source-acquisition.md` explicitly says code/fixtures do not satisfy G3, and `docs/brightdata-evidence.md` says S1 still needs to call the interface.
- Owner: S1 for integration; S4 for a reviewed live execution artifact.

### Port

- Catalog/action contracts and deterministic tests: **PASS** at the committed sponsor layer.
- Mend control endpoint and real action correlation: **FAIL/INCOMPLETE in the audited snapshot**. The committed Port workflow posts `/api/port/actions`; the server snapshot audited did not expose that route. A new uncommitted `src/mend/port-control.mjs` appeared while S5 was running, but was not yet routed or frozen for certification.
- Live G3 evidence: **NOT_RUN**. `port/README.md` labels the connected test user-required/not locally validated.
- Owner: S1/S3 integration, S3 live proof.

### SigNoz

- Deterministic correlation/redaction tests: **PASS**.
- Live logs/traces/metrics exact-run readback: **NOT_RUN**. The MCP smoke exited because `SIGNOZ_URL` was absent; no dashboard/readback packet was retained.
- Owner: S2.

No sponsor receives a G3 pass from a CLI exit code, schema test, fixture, connectivity check, or documentation claim.

## G4 — scientific/action safety: FAIL

| Criterion | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Canonical target identity resolution | PASS for `/target/analyze` resolver | Arbitrary reviewed-human UniProt resolution tests pass. | S1 |
| X/Y/Z structure identity is unambiguous | **FAIL** | Disease handoff Y still performs RCSB full-text target search. The live MGMT result included archaeal and bacterial MGMT structures; live EGFR results included antibody-only and ACK1 structures. These were validated as `HEALTHY`, proving the validator does not enforce selected-target identity/species. | S1 |
| Analyze fallback preserves identity | FAIL | Even after UniProt resolution, `analyzeTarget` falls back to RCSB text search at `src/axes/y/analyze.mjs:247` without verifying that returned entries map to the resolved accession. | S1 |
| AlphaFold is labeled predicted | PASS | Correct AlphaFold URL/download helper tests pass and the browser renders `PREDICTED STRUCTURE`. | S1 |
| Pocket provenance is complete and visible | FAIL | API returns `pockets_source` and an unavailable error, and cross-target SERPINA1 fallback was removed. However P2Rank version/command/model mode are not recorded, and the UI does not display `pockets_source`; injected fixture pockets could be shown without a visible fixture label. | S1 |
| Patent guardrails | PASS | Z summary refuses FTO conclusions; bounded search absence is explicitly not evidence of FTO. | S1 |
| Patent source is operational in browser flow | FAIL | Both live EPO calls timed out, leaving Z unavailable and blocking the workflow. | S1/source operations |
| Compound and assay provenance | FAIL/PARTIAL | ChEMBL target/activity requests, molecule source URLs, assay IDs, and scope disclaimer exist. Assay/document source URLs and target-run ownership do not; the UI presents target activities but cannot prove displayed-pocket binding or disease relevance (the scope correctly disclaims this). | S1 |
| Evidence-linked recommendations | PASS | Diligence tasks retain X/Y/Z record references and conservative limitations. | S1 |
| Human findings and decisions retained | PASS/PARTIAL | Findings and decisions persist for the current run, but completions/decisions do not require evidence IDs or open risks as the Port contract does. | S1/S3 |

## G5 — browser end-to-end: FAIL

| Step | Status | Evidence |
| --- | --- | --- |
| Enter disease | PASS | Glioblastoma submitted through the browser. |
| Corpus and candidate review | PASS | 50 resources, source-linked candidates, and contradictions rendered. |
| Select multiple targets | PASS | MGMT and EGFR saved. |
| Independent X/Y/Z display | PARTIAL | Independent target cards displayed; Z unavailable for both due timeout. |
| Analyze structure per target | FAIL | Only global Analyze controls exist; neither target card has a target-bound analysis control. |
| Investigate compounds per target | BLOCKED | Compound action appears only after the unbound structure flow. |
| Create/complete tasks | BLOCKED/FAIL | Both runs were `DEGRADED`/`BLOCKED` because Z timed out; browser returned `a healthy published Mend run is required`. |
| Record final decision | BLOCKED | Tasks could not be created. |
| Inspect SigNoz, Port, Bright Data evidence | NOT_RUN | No integrated browser controls or valid live evidence packet. |
| Restart and recover state | PASS | Disease and both target results survived restart. |

## Release blockers by owner

### S1

1. Enforce saved human selection server-side before handoff.
2. Bind structure, compounds, tasks, decisions, and caches to `target_run_id`; add per-target UI controls.
3. Resolve/validate canonical UniProt identity before Y and reject structures that do not map to the selected human target.
4. Isolate top-level target failures and retain partial successful results.
5. Preserve historical disease runs instead of clearing maps on a new discovery.
6. Honor or remove the advertised `axes` request field.
7. Remove fixed AATD text from the production discovery page.
8. Record and visibly render pocket provenance, including P2Rank version/mode.
9. Add assay/document links and run ownership to compound results.
10. Integrate the Bright Data adapter and Port action endpoint into actual target-run orchestration.

### S2

1. Produce exact-run live SigNoz log, trace, and metric readback plus dashboard evidence with no authorization failure.

### S3

1. Freeze and integrate the Port action handler/route.
2. Produce a live manually approved candidate handoff and correlated result packet; prove rejection prevents invocation.

### S4

1. Produce one reviewed target-specific live Bright Data execution with nonempty normalized output, actual asset and provider run/snapshot IDs, validation, and disease/candidate/target-run correlation.

## Required rerun

S5 must rerun the full suite, focused adversarial API tests, two unrelated disease flows, multi-target browser flow, restart recovery, and all three live sponsor proof checks against frozen commit hashes. Until then, G6 must not start and no release approval is granted.

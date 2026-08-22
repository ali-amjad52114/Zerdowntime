# Mend P0-P5 Multi-Session Execution Plan

## Product contract

Mend accepts a disease, gathers a source-linked evidence corpus, discovers possible targets, preserves supporting and contradictory passages, requires human candidate selection, runs target-specific X/Y/Z diligence, creates actionable review work, and records a human decision.

Production discovery must never require or silently inject a target. SERPINA1/AATD fixtures remain regression-only and must never be presented as live arbitrary-disease output.

## Priority scope

### P0 — correctness

- Enforce disease-only discovery and remove fixed-target leakage.
- Persist runs, papers, candidates, passages, selections, target runs, analyses, tasks, decisions, and sponsor executions.
- Resolve canonical target identifiers dynamically.
- Fix AlphaFold downloading and remove cross-target pocket fixtures.
- Make multi-target ownership, provenance, validation, and partial failures correct.
- Isolate and label all fixture, computed, illustrative, and live output.

### P1 — end-to-end integration

- Give every selected candidate an independent X/Y/Z run.
- Connect approved Bright Data sources to target-specific acquisition.
- Use Port for handoff, retry, healing approval, tasks, and decisions.
- Correlate the complete execution in SigNoz.
- Expose the full diligence workflow in the disease-first product.

### P2 — usable workflow

- Add durable background execution, progress, retry, history, comparison, reviewer findings, final decisions, evidence export, pagination, and filtering.

### P3 — scientific usefulness

- Broaden the evidence corpus and canonical identity resolution.
- Add biological context, known compounds, ChEMBL/assay evidence, ligand and pocket investigation, candidate comparison, research memos, and evidence-linked recommendations.
- Keep docking optional and gated behind validated upstream evidence.

### P4 — reliable operation

- Add idempotency, restart recovery, bounded retries, rate-limit handling, scheduling, incremental refresh, adapter versioning, raw-response checksums, provenance retention, dashboards, alerts, and runbooks.

### P5 — cloud proof and release

- Deploy persistent API/frontend state, run live sponsor and browser tests, retain redacted request/response proof, publish limitations and rollback instructions, and release only after independent gate approval.

## Session ownership

### S1 — Core disease-first product

Owns the canonical run schema, persistence, server routes, frontend, discovery, multi-target orchestration, X/Y/Z contracts, target identity, structure correctness, compounds, diligence, history, reports, and final integration. S1 defines sponsor adapter contracts but does not absorb sponsor implementation.

### S2 — SigNoz

Owns OTLP traces/logs/metrics, disease/candidate/target/axis/source correlation, dashboards, alerts, MCP verification, cloud ingestion proof, and observability runbooks. Required identifiers include `disease.run.id`, `candidate.id`, `target.run.id`, `axis`, `source.execution.id`, `brightdata.collector.id`, and `port.run.id`.

### S3 — Port

Owns disease/candidate/target/axis/task/decision blueprints, candidate handoff, axis retry, scraper-healing approval, task completion, final decisions, GitHub dispatch, result synchronization, audit history, and cloud Port proof. Fixed SERPINA1 entities are regression-only.

### S4 — Bright Data

Owns account inventory, approved dataset/collector reuse, public biotech pipeline and public-register acquisition gaps, generalized collectors, scheduling/healing provenance, raw artifacts, normalization, validation, correlation, and live account proof. Prefer authoritative APIs and existing accessible datasets/collectors before creating anything.

### S5 — Independent gate

Owns acceptance review only. S5 audits commits, executes deterministic and live tests, inspects provenance and payloads, checks fixed-target leakage, verifies browser behavior and sponsor evidence, and rejects incomplete work. S5 does not repair feature code on behalf of its owner.

## Gates

### G0 — contract

Freeze schemas, APIs, ownership boundaries, test diseases, evidence contracts, and sponsor execution contracts before cross-session integration.

### G1 — disease-only invariant

Using at least two unrelated diseases, prove no target enters discovery, no fixed AATD values leak, candidates originate in exact source evidence, contradictions remain visible, and human selection is required.

### G2 — target-run correctness

Prove multiple selected candidates receive independent X/Y/Z and structure runs; failures, caches, tasks, and evidence cannot cross target boundaries.

### G3 — sponsor proof

Require a live non-secret input summary, external run/request identifier, nonempty response, normalized result, validation, and disease/target correlation for Bright Data, Port, and SigNoz. A process exit code alone is insufficient.

### G4 — scientific/action safety

Verify unambiguous identity, predicted-structure labeling, pocket provenance, patent guardrails, compound/assay sources, evidence-linked recommendations, and retained human findings.

### G5 — browser end-to-end

From a clean environment: disease input, corpus, candidate review, multi-target selection, X/Y/Z, structure, compounds, tasks, decision, sponsor inspection, restart, and state recovery must all pass.

### G6 — cloud release

Release only after automated tests, live sponsor proof, browser acceptance, persistence recovery, fixed-demo isolation, documented limitations/runbooks, production smoke tests, and S5 approval.

## Execution discipline

- S1-S4 run as independent workstreams with non-overlapping ownership.
- Shared behavior is integrated through versioned contracts and adapters.
- No sponsor secrets or unredacted credentials enter code, artifacts, logs, or telemetry.
- No fixture is represented as live evidence.
- No session self-certifies; S5 evaluates exact commit hashes.
- Failed gates return work to the owning session.

## Integrated execution status — 2026-08-22

- P0 correctness: complete and merged.
- P1 end-to-end integration: complete locally; cloud callbacks/telemetry remain gated by deployment configuration.
- P2 usable workflow: the critical slice is complete (history, review tasks, findings/decision contracts, retry/healing control); broader pagination/filtering remains future scope.
- P3 scientific usefulness: evidence-derived discovery, exact identity, structures, source-linked ChEMBL activities, patents, and candidate diligence are complete for the critical slice.
- P4 reliable operation: persistence, restart recovery, idempotency, bounded retry, provenance, redaction, dashboards/alerts/runbooks, and sponsor artifacts are implemented.
- P5 cloud proof and release: Bright Data PASS; Port PARTIAL; SigNoz PARTIAL; cloud deployment and final release remain blocked.

The four delegated workstreams were merged back into the primary integration branch. The authoritative current result is `docs/gates/S5_GATE_REPORT_2026-08-22.md`.

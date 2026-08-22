# Mend integrated gate report — 2026-08-22

## Decision

**LOCAL PRODUCT ACCEPTED; CLOUD RELEASE BLOCKED.** The merged product passes the deterministic suite and complete local browser workflow. Bright Data has strict live G3 proof. Port has live catalog and Port-to-GitHub proof, but not a live callback into a cloud-hosted Mend API. SigNoz service-account API and MCP access work, but exact-run OTLP cloud ingestion/readback is not proven because the Cloud ingestion endpoint/header are not configured.

Integrated product commit: `0ef5e7c`; evidence/report commit pushed to `origin/master`: `6b1c5fe`.

## Automated integration evidence

- `npm test`: **PASS, 243/243**.
- `npm run port:smoke`: **PASS, 10/10**, including 14 blueprints, eight actions, production/regression separation, Port contracts, and workflow behavior.
- `npm run port:validate`: **PASS**.
- `npm run mend:demo`: **PASS** for healthy, isolated X failure with previous healthy preservation, and repaired v2 recovery.
- `git diff --check`: **PASS**.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| G0 — contracts | PASS | Disease-first schemas, evidence contracts, sponsor adapters, Port actions, correlation attributes, and gate requirements are versioned and tested. |
| G1 — disease-only invariant | PASS | Browser accepted only `glioblastoma`; collected 50 Europe PMC papers; derived 25 evidence-linked candidates; preserved supporting and contradictory passages; required a saved human selection before handoff; no fixed AATD placeholder appeared. |
| G2 — target-run correctness | PASS | Historical runs/workflows are retained; multi-target failures are isolated; partial axes are rejected; structure/compound calls are bound to run, disease, target, and UniProt; caches are run-isolated; restart recovery passed. |
| G3 — sponsor proof | PARTIAL | Bright Data PASS. Port catalog/dispatch PASS but cloud Mend callback blocked. SigNoz service-account/MCP PASS but exact-run OTLP ingestion/readback blocked. |
| G4 — scientific/action safety | PASS with disclosed limitation | Exact reviewed-human UniProt drives RCSB; no unsafe text fallback; AlphaFold is labeled; ChEMBL activities are source-linked and explicitly not pocket/clinical proof; patents retain the no-FTO guardrail; P2Rank absence is displayed rather than replaced with fixture data. |
| G5 — browser end to end | PASS locally | Disease → corpus → candidates → saved EGFR selection → X/Y/Z → structure → compounds → review tasks → restart recovery all passed. |
| G6 — cloud release | BLOCKED | No cloud Mend deployment/URL; Port cannot call back into Mend; SigNoz OTLP ingestion configuration is absent. |

## Live browser acceptance

The merged server ran at `http://localhost:3100/mend` with durable file state.

1. Submitted `glioblastoma` with no target.
2. Received 50 source-linked Europe PMC papers.
3. Derived 25 candidates from exact corpus passages. MGMT and ZIC3 cards visibly retained contradictory passages.
4. Selected EGFR and saved the human gate before handoff.
5. The target run `discovery-egfr-d0eb73e3` completed all axes:
   - X: 25 ClinicalTrials.gov records.
   - Y: 25 RCSB structures resolved through exact human EGFR UniProt identity.
   - Z: 25 EPO publication records.
6. Structure analysis selected PDB `1XKK`, X-ray, 2.4 Å. P2Rank was not installed; the UI honestly displayed `spawn prank ENOENT`, no pockets, and its provenance/mode.
7. ChEMBL returned source-linked EGFR activities with the explicit limitation that these do not prove binding to the displayed pocket or clinical suitability.
8. Created the three evidence-linked human review tasks.
9. Restarted the process and verified `DILIGENCE_COMPLETE`, one saved target, its target-run card, and review controls were restored.

## Sponsor proof

### Bright Data — PASS

- Existing collector: `c_mt4r97wsmxt9an0ap`.
- Public source: Arrowhead pipeline.
- Disease/target: Obesity + ALK7, `disease_and_target` match policy.
- Provider response ID: `d2t1787441811998rnfr6lsqfb4g`.
- Counts: 21 raw, one exact relevant record, one normalized ARO-ALK7 record.
- Validation and live gate: PASS.
- Redacted evidence: `docs/gates/evidence/brightdata-g3-obesity-alk7-20260822/`.

### Port — PARTIAL

- Live API authentication and catalog readback: PASS.
- Synced/read back 14 blueprints, five production seed entities, and eight actions.
- Live bounded Port-to-GitHub dispatch: PASS.
- Port run: `r_qBVeTDdvAQ5pqh3f`; GitHub run: `32606151307`; final status: SUCCESS.
- Strict Port-to-cloud-Mend callback: BLOCKED. The new callback workflow is now on remote `master`, but no reachable cloud `MEND_API_URL` / matching `MEND_PORT_ACTION_TOKEN` is configured.
- Redacted evidence: `docs/gates/G3_PORT_PROOF_2026-08-22.md`.

### SigNoz — PARTIAL

- Workspace: `https://happy-fowl.us2.signoz.cloud`.
- MCP transport/initialization: PASS.
- The user-supplied service-account key was validated read-only against `/api/v1/service_accounts/me`: HTTP 200.
- The service-account key is not used as an ingestion key.
- Deterministic exact-run trace/log/metric correlation and redaction tests: PASS.
- Cloud OTLP emission and exact-run readback: BLOCKED because `OTEL_EXPORTER_OTLP_ENDPOINT` and an OTLP header containing `signoz-ingestion-key` are absent.

## Remaining release inputs

1. Deploy the merged Mend API/frontend and provide its stable HTTPS base URL.
2. Configure the same `MEND_PORT_ACTION_TOKEN` in Mend and GitHub, plus `MEND_API_URL` in GitHub.
3. Configure the SigNoz Cloud OTLP endpoint and ingestion header; then run `npm run signoz:g3:smoke` and retain exact-run traces/logs/metrics readback.
4. Rerun the cloud browser and sponsor gate on the deployed commit before release.

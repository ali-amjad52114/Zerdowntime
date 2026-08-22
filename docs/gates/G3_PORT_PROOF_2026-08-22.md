# G3 Port proof — 2026-08-22

Status: **PARTIAL / external Mend callback blocked**

This proof is intentionally redacted. It contains Port and GitHub request/run identifiers, repository coordinates, and normalized non-secret status only. It contains no client secret, bearer token, Mend action token, or source credential.

## Live catalog and action wiring

- Port API authentication succeeded against the configured account.
- The repository model was synced idempotently: 14 blueprints, 5 production seed entities, and 8 actions.
- A subsequent read-only verification returned HTTP 200 for all 14 blueprints and all 8 actions.
- Final read-only proof timestamp after the last sync: `2026-08-22T23:50:37.240Z`.
- Authentication request ID: `c189f0cd-8dfe-454f-930e-83056e476a89`.

Disease-first blueprint request IDs:

| Contract | Port request ID |
|---|---|
| `mendDiseaseRun` | `90fc0bd4-2d0a-47d9-9fb0-eeadfa8cece6` |
| `mendCandidateTarget` | `a181a8e9-64eb-403c-b9b1-3e8a307b12a9` |
| `mendTargetRun` | `b387319d-4f83-4a9c-8092-b3113cce2a28` |
| `mendAxisRun` | `7ab94742-493c-4619-9d81-68570f1a50a7` |
| `mendDiligenceTask` | `45c3a866-8cd0-41af-b000-e87cf8692883` |
| `mendTargetDecision` | `72968e0b-f847-45ee-9071-d6ca0170c207` |

Disease-first action request IDs:

| Action | Port request ID |
|---|---|
| `mend_handoff_candidate` | `e44fe11b-6d14-4b59-ae21-25d6df493269` |
| `mend_retry_axis` | `ea409ae2-f48a-4783-9ff1-084a65f7c865` |
| `mend_approve_source_healing` | `d6ffeebc-f077-4fc3-9df9-91542a327f08` |
| `mend_complete_diligence_task` | `61396484-a2f9-4f30-acee-22e2327d52eb` |
| `mend_record_target_decision` | `dfe251d5-47ac-4e7a-8bba-8364c1e5f33d` |

## Live Port → GitHub dispatch and callback

- Port action: `zd_submit_change` (bounded prepare path; no release).
- Port action run ID: `r_qBVeTDdvAQ5pqh3f`.
- Port launch request ID: `05d1b3d5-5e5e-46e9-a051-005f1fdaac34`.
- Final Port status: `SUCCESS`.
- GitHub workflow run ID: `32606151307`.
- GitHub workflow run: <https://github.com/ali-amjad52114/Zerdowntime/actions/runs/32606151307>.
- GitHub job ID: `97111371780`; conclusion `success`.
- The GitHub job completed catalog validation and synchronized its run entity back to the originating Port action audit.

## Normalized Mend result

The normalized `mend.port-control/v1` result contract is fully exercised by the deterministic end-to-end adapter test, including `port_run_id`, `action`, `action_execution_id`, `correlation`, status, and schema-valid `port_entities`. The workflow artifact now also records the Mend HTTP request ID, GitHub run ID/URL, Port entity-upsert request IDs, and normalized Mend result.

No live normalized Mend result is claimed here. The live GitHub default branch used by Port was `master` at `ae6a09eebb5c3db98da8dc7d1fd1b6ebb7e3bd01`, which predates `.github/workflows/port-mend-control.yml` and the disease-first adapter. The available local credential file also has no `MEND_API_URL` or `MEND_PORT_ACTION_TOKEN`. Because this task explicitly forbids pushing main, a real Mend action cannot safely dispatch and callback until this commit is reviewed and merged and those two GitHub secrets point at a reachable Mend service.

Therefore the strict G3 requirement—one externally correlated Port Mend run, GitHub run, Mend request/execution ID, normalized result, and Port result sync—remains blocked. Catalog presence and generic Port/GitHub dispatch are proven; they are not represented as a substitute for the missing live Mend callback.

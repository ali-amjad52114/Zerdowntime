# Port integration

This directory is the Git-controlled source of truth for the Port control plane. The original product-neutral delivery regression remains intact, while production Mend entities are disease-first and target-dynamic. SERPINA1/AATD entities are listed only under `manifest.regressionEntities`; `port-sync.mjs` never syncs that collection.

## Repository artifacts

- `blueprints/` includes the legacy delivery model plus production `mendDiseaseRun`, `mendCandidateTarget`, `mendTargetRun`, `mendAxisRun`, `mendDiligenceTask`, and `mendTargetDecision` contracts.
- `entities/` seeds goals, constraints, technical choices, risks, and service boundaries.
- `actions/submit-change.json` starts plan/build/test from a brief.
- `actions/release-change.json` is a separate day-2 action with `requiredApproval: true`. A Port decline leaves the backend uninvoked.
- `actions/retry-run.json` reruns the failed stage with the same workflow/correlation identifier.
- `.github/workflows/port-delivery.yml` remains the generic delivery regression backend.
- `.github/workflows/port-mend-control.yml` invokes the real Mend control adapter and synchronizes returned entities; it does not simulate application success.
- `scripts/lib/port-workflow.mjs` implements the local state machine and audit trail.

## Disease-first Mend control plane

The production graph is:

```text
mendDiseaseRun
  -> mendCandidateTarget
    -> [human-approved handoff]
      -> mendTargetRun
        -> independent mendAxisRun (X/Y/Z)
        -> mendDiligenceTask
        -> immutable mendTargetDecision
```

`mendDiseaseRun` intentionally has no target property. Candidate evidence IDs and contradictory counts are retained before handoff. Every axis and task has exactly one target-run owner, preventing multi-target overwrites. Decisions require a rationale, evidence IDs, open risks, actor, and timestamp.

Port exposes five Mend actions:

| Action | Target | Manual approval | Mend operation |
|---|---|---:|---|
| Approve candidate and start diligence | candidate | yes | `handoff_candidate` |
| Retry failed Mend axis | axis run | no | `retry_axis` |
| Approve source healing | axis run | yes | `approve_source_healing` |
| Complete diligence task | task | no | `complete_diligence_task` |
| Record target decision | target run | yes | `record_target_decision` |

All five dispatch `port-mend-control.yml`. That workflow sends `POST /api/port/actions` with `Authorization: Bearer <MEND_PORT_ACTION_TOKEN>` and `Idempotency-Key: <Port action run ID>`. The JSON envelope is:

```json
{
  "contract_version": "mend.port-control/v1",
  "action": "handoff_candidate",
  "idempotency_key": "port-action-run-id",
  "port_run_id": "port-action-run-id",
  "actor": "human-actor",
  "requested_at": "ISO-8601",
  "correlation": {
    "port.run.id": "port-action-run-id",
    "candidate.id": "candidate-id",
    "disease.run.id": "disease-run-id"
  },
  "resource": {
    "type": "candidate_target",
    "id": "candidate-id",
    "parent_id": "disease-run-id"
  },
  "input": {
    "axes": ["X", "Y", "Z"],
    "selection_reason": "source-linked rationale",
    "expected_selection_status": "pending"
  }
}
```

Operation-specific `input` contracts are:

- `handoff_candidate`: `axes`, `selection_reason`, `expected_selection_status=pending`.
- `retry_axis`: `axis`, `reason`, `expected_status=failed`, `expected_retry_count`.
- `approve_source_healing`: `axis`, `source_execution_id`, `healing_request_id`, `reason`, `evidence_url`, `expected_status=healing_pending`.
- `complete_diligence_task`: `finding`, `outcome`, nonempty `evidence_ids`, `expected_status=open`.
- `record_target_decision`: `decision`, `rationale`, nonempty `evidence_ids`, `open_risks`, `expected_status=review`.

Mend must respond with the same contract and Port run ID, a durable action execution ID, a terminal/accepted status, and normalized Port entities:

```json
{
  "contract_version": "mend.port-control/v1",
  "port_run_id": "port-action-run-id",
  "action_execution_id": "mend-action-id",
  "status": "accepted",
  "port_entities": [
    { "blueprint": "mendTargetRun", "entity": { "identifier": "target-run-id", "properties": {}, "relations": {} } }
  ]
}
```

The adapter rejects mismatched correlation IDs, invalid state preconditions, invalid evidence payloads, and blueprints outside the controlled manifest. Returned entities are attached to the Port action run during upsert.

## Credential-free smoke test (validated locally)

```sh
npm ci
npm run port:smoke
npm run port:prepare
npm run port:release
```

Inspect `artifacts/port/local-demo/run.json`. It contains the brief, derived plan/hash, build/test/release outputs, correlation ID, approval actor, and ordered audit events.

Approval rejection:

```sh
node scripts/port-workflow.mjs prepare --brief fixtures/port/brief.json --run-id rejected-demo
node scripts/port-workflow.mjs release --run-id rejected-demo --decision reject --actor local-reviewer --reason "Evidence incomplete"
```

Controlled failure, successful retry, and approval:

```sh
node scripts/port-workflow.mjs prepare --brief fixtures/port/brief.json --run-id retry-demo --fail-stage test
node scripts/port-workflow.mjs retry --run-id retry-demo
node scripts/port-workflow.mjs release --run-id retry-demo --decision approve --actor local-reviewer
```

The first command intentionally exits nonzero with `retry_pending`. To prove escalation, pass `--fail-stage test` to both retry commands; the third failed attempt becomes `escalated` because `max_retries` is two.

Requirement change:

```sh
node scripts/port-workflow.mjs prepare --brief fixtures/port/brief.json --run-id revision-demo
node scripts/port-workflow.mjs revise --brief fixtures/port/revised-brief.json --run-id revision-demo
```

Compare the two `plan_hash` values in command output and inspect the `plan_revised` audit event.

`npm run port:sync` is dry-run only and makes no network changes. No Port credentials or UI access are needed for any command above.

## Port account setup (user-required; not locally validated)

1. Install Port's GitHub integration for the repository and permit it to dispatch `.github/workflows/port-delivery.yml`.
2. In ignored `.env.local`, set `PORT_CLIENT_ID`, `PORT_CLIENT_SECRET`, `PORT_GITHUB_ORG`, and `PORT_GITHUB_REPO`. Use `PORT_API_URL=https://api.us.port.io` for a US-region account; the default is the EU API.
3. Add `PORT_CLIENT_ID` and `PORT_CLIENT_SECRET` as GitHub Actions repository secrets. Do not put their values in Port JSON, workflow inputs, logs, or commits.
4. Also configure GitHub secrets `MEND_API_URL` and `MEND_PORT_ACTION_TOKEN` for the control adapter. They are never placed in a Port entity or workflow input.
5. Run `npm run port:validate`, then `npm run port:sync -- --live`. The sync creates or replaces the fourteen blueprints, production-safe seed entities, three generic delivery actions, and five Mend control actions. Re-running it is idempotent. Regression entities and validated examples are not automatically synced.
6. Restrict action execution/approval RBAC in Port to intended teams or users. Candidate handoff, source healing, target decisions, and generic release require manual approval.
7. After each real action, retain the Port action run ID, Mend `action_execution_id`, GitHub run URL, affected entity IDs, and redacted request/result artifact.

If API sync is unavailable, create the blueprints in manifest order, then seed entities, then create the actions by pasting their JSON in Port. Replace the two `REPLACE_WITH_GITHUB_*` values when using this manual route.

## Connected smoke test (user-required)

The G3 Port gate is not satisfied by catalog sync or a CLI exit code. Retain screenshots or API output proving all of the following against the live account:

1. All six production Mend blueprints and five actions exist with expected RBAC.
2. A real evidence-derived candidate entity relates to its disease run.
3. Candidate handoff is manually approved and creates a distinct real `mendTargetRun` through Mend.
4. A failed real axis can be retried without changing its target owner; attempt history is retained.
5. A pending real source-healing request cannot run before Port approval.
6. A diligence finding and final decision synchronize back with evidence IDs and actor.
7. Port action run ID, GitHub workflow run, Mend action execution ID, and resulting entity IDs correlate.
8. A rejected manual action does not call Mend.

The generic delivery regression can still be checked separately:

1. Run **Submit brief or change** with the values from `fixtures/port/brief.json`.
2. Confirm its GitHub run passes validation/build/test and the resulting `zdWorkflowRun` entity is `awaiting_approval` with a matching correlation ID and attached Port action-run history.
3. Run **Approve and release change** on that entity. First decline it and confirm no GitHub workflow is dispatched. Run it again, approve it, and confirm status `released` with approval and audit events.
4. Trigger a controlled failure in a local/demo branch with `--fail-stage test`, sync its run artifact, and invoke **Retry failed run**. Repeat failure through the retry budget to confirm `escalated`, or omit the flag to confirm successful recovery.
5. Submit the revised fixture and confirm the revision and plan hash change. Repeat the original brief with a new run ID to confirm no manual reconstruction is required.

The repository validates schemas, relationships, action wiring, approval policy, rejection behavior, bounded retry/escalation, requirement-driven replanning, and repeatability. Port account creation, GitHub installation/dispatch, live action history, approver RBAC, and UI evidence remain user-required because this repository has no Port credentials or authenticated UI session.

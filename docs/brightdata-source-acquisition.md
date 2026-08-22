# Mend Bright Data source-acquisition contract

## Scope

Session 4 owns a versioned boundary between a selected Mend target run and an approved Bright Data asset. The boundary is implemented by `src/acquisition/brightdata-source.mjs`; it does not modify the server or discovery UI.

Discovery remains disease-only. Bright Data acquisition begins only after a candidate has been selected and a distinct `target_run_id` exists.

## Source selection order

For every acquisition gap, call `chooseAcquisitionRoute` with known source availability:

1. Use an accessible authoritative API.
2. Otherwise reuse an existing suitable Bright Data marketplace dataset.
3. Otherwise reuse an existing suitable Scraper Studio collector.
4. If none exists, return `gap_requires_review`. Creating a collector requires explicit approval and a public, non-authenticated source.

The repository does not treat Bright Data as a substitute for PubMed, ClinicalTrials.gov, RCSB, EPO, or another accessible authoritative API.

## Request interface for S1

```js
import {
  createBrightDataAcquisitionRequest,
  executeBrightDataAdapter,
  persistBrightDataSourceExecution,
} from './src/acquisition/brightdata-source.mjs';

const request = createBrightDataAcquisitionRequest({
  diseaseRunId,
  candidateId,
  targetRunId,
  disease: { name, aliases },
  target: { name, aliases, identifiers: { uniprot } },
  matchPolicy: 'disease_or_target',
  source: {
    kind: 'scraper_studio_collector',
    assetId: collectorId,
    url: publicPipelineUrl,
    publicSourceApproved: true,
  },
});

const result = executeBrightDataAdapter({ request, payload });
const execution = persistBrightDataSourceExecution({
  request,
  payload,
  adapterResult: result,
  executionId,
  providerRunId,
  startedAt,
  mode: 'live',
});
```

The request contains no API key, bearer token, cookie, or other credential. Secret-shaped keys are rejected before requests or raw artifacts are persisted.

## Durable artifacts

Each execution is stored under:

```text
artifacts/source-executions/<source_execution_id>/
  manifest.json
  raw.json
  normalized.json
```

`manifest.json` uses contract `mend.source-execution.v1` and records:

- Disease-run, candidate, target-run, and axis correlation
- Canonical non-secret telemetry attributes (`source.provider`, `source.execution.id`, `disease.run.id`, `candidate.id`, `target.run.id`, and the Bright Data asset ID)
- Bright Data source kind and asset ID
- External provider run/snapshot ID, when available
- Non-secret query and public source URL
- Start and completion times
- SHA-256 and byte length for raw and normalized artifacts
- Raw, relevant, and normalized record counts
- Validation/quarantine result
- Healing history
- Explicit live-gate checks

Fixture executions are always marked `mode: fixture` and can never pass the live sponsor gate, even if a fake provider ID is supplied.

## Dynamic matching and evidence

The adapter receives disease and target terms from the selected target run. It has no production defaults for SERPINA1, AATD, or any other target. Short aliases use token-boundary matching rather than arbitrary substring matching.

Every normalized program retains:

- The exact `evidence_excerpt` returned by the source
- Source URL and retrieval time
- Bright Data asset ID
- Source execution ID
- Raw record index
- Disease and target terms that caused the match

Records without identity, source URL, or exact evidence are quarantined by the existing X-axis validator. An unapproved source is also quarantined.

## Live command

`npm run mend:x:live` requires the following in ignored local environment configuration:

```text
BRIGHTDATA_API_KEY
MEND_X_COLLECTOR_ID
MEND_X_TARGET_URL
MEND_X_PUBLIC_SOURCE_APPROVED=true
MEND_DISEASE_RUN_ID
MEND_DISEASE_NAME
MEND_DISEASE_ALIASES
MEND_CANDIDATE_ID
MEND_TARGET_RUN_ID
MEND_TARGET_NAME
MEND_TARGET_ALIASES
MEND_TARGET_UNIPROT_ID
MEND_SOURCE_EXECUTION_ID
MEND_X_PROVIDER_RUN_ID
```

Aliases are comma-separated. `MEND_X_PROVIDER_RUN_ID` must contain the actual external snapshot/run ID. The current CLI output does not reliably expose one, so omitting it makes `live_gate.pass` false even when retrieval and normalization succeed.

## Creation and healing controls

- `npm run mend:x:create` has no fallback disease, target, or URL. It exits unless `MEND_X_CREATE_APPROVED=true` is explicitly set after source review.
- `npm run mend:x:heal` requires a recorded reason and exits unless `MEND_X_HEAL_APPROVED=true` is explicitly set after an external approval.
- Neither command was run during Session 4 implementation.

## Deterministic acceptance evidence

`test/brightdata-source.test.mjs` proves:

- CFTR/cystic-fibrosis acquisition contains no fixed AATD terms.
- A distinct PCSK9/familial-hypercholesterolemia run cannot inherit CFTR records.
- Source routing prefers authoritative APIs and existing assets.
- Private URLs, secrets, and unapproved sources are rejected or quarantined.
- Raw and normalized checksums, correlations, external run IDs, and execution provenance persist.
- Fixture output cannot satisfy the live sponsor gate.

## Remaining G3 live evidence

Code and fixtures do not satisfy G3. The independent gate still needs one safe live run that retains:

- Non-secret disease/target/source input summary
- Actual collector/dataset ID
- Actual external run/snapshot ID
- Nonempty raw response
- Normalized, source-linked program record
- Passing validation
- Disease-run and target-run correlation

The live artifact must be redacted and reviewed before it is included in release evidence.

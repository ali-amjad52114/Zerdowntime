# Mend MVP Product and Engineering Specification

**Status:** Proposed v0.3

**Product:** Mend — Agentic Software Factory for Self-Healing Biotech Intelligence

**Primary objective:** Prove one repeatable, observable, repairable, and human-controlled factory that converts an intelligence brief into versioned software, deploys that software, and uses it to produce trustworthy, evidence-grounded biotech intelligence.

## 1. Product contract

Mend maintains biotech drug-program intelligence that is published on messy,
changing web sources and poorly covered by structured scientific databases.
The factory—not the frontend—is the MVP product. It manufactures and evolves
the source adapters, scraper definitions, mappings, validation policies, tests,
workflows, and telemetry required to operate the intelligence pipeline.

The product contains two inseparable loops:

```text
Software build loop:
Brief → Assemble Context → Plan → Generate/Modify Software → Test
    → Review Change → Human Approve/Reject → Deploy Factory Version

Operational intelligence loop:
Discover Sources → Scrape → Normalize → Explore Candidates
    → Resolve Aliases → Validate Evidence → Enrich → Compare
    → Detect Failure → Block Release → Diagnose → Generate Repair
    → Test Repair → Human Approve/Reject → Deploy Repair → Re-scrape
    → Re-validate → Human Approve/Reject Dataset → Release
```

Mend must never release a suspicious candidate dataset, fabricate missing
scientific facts, or represent an enrichment association as proof.

### 1.1 Definition of software factory

Mend qualifies as a software factory only when a brief or detected failure can
produce a governed, versioned software change. A run that only moves data
through a fixed pipeline is a data pipeline, not sufficient proof of the
challenge. Every build or repair must create reviewable software artifacts,
verification evidence, and a deployable factory version.

The minimum manufactured software unit includes:

- A versioned plan and context manifest.
- Source configuration and, when needed, source-adapter or scraper changes.
- Canonical mappings and validation-policy changes.
- Tests and safe fixtures that prove the requested behavior and prevent regressions.
- Port workflow/entity updates and SigNoz telemetry changes when applicable.
- A Git commit or pull request linked to the originating brief, run, and evidence.
- A deployable factory version that can be rolled forward without mutating a prior release.

### 1.2 Problem and solution

#### Problem

Biotech competitive intelligence is fragmented across changing websites,
registries, publications, company announcements, and documents. The same drug,
company, or indication may appear under multiple names; important attributes
may be missing or contradictory; and a source-layout change can silently turn
a healthy extraction into an incomplete dataset. A general research agent may
find plausible candidates, but plausibility alone is not sufficient for a
releasable scientific claim.

#### Solution

Mend manufactures and operates the software needed to answer an intelligence
brief. It generates or modifies source adapters, research prompts, mappings,
validation policies, tests, workflows, and telemetry; verifies the change;
requires human approval; and deploys an immutable factory version. At runtime,
a high-recall Explorer discovers candidate programs, a separate evidence-based
Validator checks them, and Port holds consequential software and dataset
decisions for humans. Bright Data supplies current web evidence and SigNoz
makes the complete build, research, validation, and repair path observable.

## 2. MVP scope

### Included

- Five messy-web sources:
  - DNDi
  - Medicines for Malaria Venture (MMV)
  - Global Antibiotic Research and Development Partnership (GARDP)
  - Small biotech A (to be selected)
  - Small biotech B (to be selected)
- Bright Data Scraper Studio acquisition and repair workflows.
- Brief-to-code generation for source adapters, scraper definitions, mappings,
  validation policies, tests, workflow configuration, and telemetry.
- Versioned Git changes, automated verification, human review, and deployment
  of immutable factory versions.
- Failure-to-repair generation that produces a bounded software patch rather
  than silently changing a live scraper or pipeline.
- Canonical normalization, evidence preservation, validation, and historical comparison.
- Bounded competitive-landscape discovery using an Explorer, alias resolution,
  structured research summaries, and an independent evidence Validator.
- Versioned evaluation datasets and precision/recall/F1 regression gates for
  research-agent, prompt, mapping, and validator changes.
- Structured enrichment from Open Targets, ChEMBL, and PubMed only.
- Port entities, relationships, run control, remediation, approval, and audit history.
- OpenTelemetry traces, metrics, and logs in SigNoz.
- One minimal intelligence view for sources, programs, changes, evidence, and enrichment.
- A real or reproducible `healthy → broken → repaired → approved` demo.
- Re-running the same architecture for a changed intelligence brief.

### Excluded

- More than five web sources.
- bioRxiv, Synapse, BoltzAPI, Owkin, LatchBio, InductiveBio, BioSkepsis, or other enrichment systems.
- Predictive drug-discovery claims or inferred mechanisms unsupported by sources.
- Autonomous release after repair.
- A second operational dashboard that duplicates Port or SigNoz.
- Production-scale crawling, billing, multi-tenancy, or complex identity management.
- Unbounded autonomous web research, unrestricted search fan-out, or a claim
  that a language-model judgment is ground truth.
- Reproducing the paper's private benchmark or presenting its reported scores
  as Mend performance without an independent Mend evaluation.
- Unreviewed autonomous code deployment or direct mutation of production software.

## 3. Users and outcomes

### Intelligence analyst

- Submits or changes an intelligence brief.
- Reviews discovered competitor candidates, supporting evidence, aliases, and validator verdicts.
- Reviews material drug-program changes with source evidence.
- Approves or rejects repaired candidate releases.

### Factory operator

- Sees source health and factory-run state in Port.
- Diagnoses failures from SigNoz without relying on terminal output.
- Starts or reviews Bright Data repair and re-scrape activity.

### Demo reviewer

- Can follow a single run across Bright Data, Port, SigNoz, and Mend using one `run.id`.
- Can verify that bad data was blocked and the prior healthy release stayed active.

### 3.1 Primary user flow

1. An intelligence analyst submits a question such as, “Map active competitor
   programs for indication X and monitor material changes.”
2. Mend assembles repository context and manufactures any required adapter,
   prompt, schema, mapping, validation, test, Port, or telemetry change.
3. Automated tests and historical evaluation datasets measure correctness and
   regressions. Port presents the exact software diff and evidence to a human.
4. Approval deploys an immutable `factory.version`; rejection leaves the
   currently active factory untouched.
5. Bright Data retrieves approved web sources. The Explorer generates a broad
   candidate set and compact structured summaries with source evidence.
6. Alias resolution links equivalent indication, drug, and organization names
   while preserving original source values and confidence.
7. The Validator independently checks each candidate using explicit evidence
   rules. Unsupported candidates are rejected with a reason; ambiguous cases
   are routed to an analyst.
8. Passing candidates are enriched, compared with the last healthy release,
   and presented in Port as a versioned candidate dataset.
9. The analyst approves or rejects the dataset. Only the exact approved
   candidate becomes the new immutable release.
10. SigNoz correlates the whole path. A source, evaluation, or validation
    failure blocks release and can initiate a new governed software-repair loop.

## 4. System architecture

```text
Intelligence Brief
       │
       ▼
Port brief + context plane
       │
       ▼
Planning agent → versioned plan/context manifest
       │
       ▼
Coding agent → adapter/config/mapping/policy/tests/workflow changes
       │
       ▼
Git change → automated tests → Port software-change gate
       │ approve
       ▼
Immutable factory version deployed
       │
       ├─────────────────────────────────────────────────────┐
       ▼                                                     │
Bright Data scrape → source artifact                         │
       │                                                     │
       ▼                                                     │
Normalize → Explore candidates → Resolve aliases             │
       │                                                     │
       ▼                                                     │
Validate schema + evidence ──fail──→ quarantine → diagnosis  │
       │ pass                                  │              │
       ▼                                       ▼              │
Open Targets / ChEMBL / PubMed       agent-generated repair  │
       │                              + fixtures/tests         │
       ▼                                       │              │
Compare with previous healthy release          └─→ change gate│
       │                                              │deploy  │
       ▼                                              └─rescrape
Candidate dataset → Port dataset gate → release or reject

OpenTelemetry wraps build and runtime stages → SigNoz
```

### Architectural boundaries

- Source adapters know source-specific fields and selectors.
- The factory core consumes only canonical records and source/run metadata.
- Enrichment adapters return namespaced facts with citations; they do not mutate source claims.
- The Explorer is optimized for bounded coverage; the Validator is a separate
  decision layer optimized for evidence-backed precision.
- Language-model judgments are advisory. Deterministic checks, cited source
  evidence, evaluation results, and human decisions remain authoritative.
- Port owns control state and consequential approval decisions.
- Git owns versioned software history; every deployed factory version resolves
  to an immutable commit and verification record.
- Agents may propose code and configuration, but may not approve or deploy
  their own consequential changes.
- SigNoz owns operational diagnosis, not workflow state.
- A released dataset is immutable. A new run creates a new candidate version.

## 5. Identifiers and correlation

Every execution receives a UUID `run.id`, created before acquisition begins.
The same ID must appear in:

- Port Factory Run and Repair entities.
- Bright Data invocation metadata and saved artifact path where supported.
- Every OpenTelemetry span, structured log, and run-scoped metric point.
- Candidate and released dataset manifests.
- Approval/rejection records.

Other stable identifiers:

- `change.id`: UUID for one brief-driven or repair-driven software change.
- `factory.version`: immutable deployed Git commit or release identifier.
- `source.id`: repository-defined slug, such as `dndi` or `small-biotech-a`.
- `record.id`: deterministic fingerprint of normalized organization, program, disease, and source identity fields.
- `dataset.id`: immutable version identifier for one validated candidate or release.
- `repair.id`: UUID for one repair attempt linked to the failed run and source.
- `candidate.id`: deterministic or UUID identity for one discovered competitive candidate.
- `claim.id`: deterministic identity for one versioned evidence-backed claim.

`change.id` and `factory.version` must appear in Port, Git evidence, deployment
manifests, and applicable OpenTelemetry spans so a reviewer can trace a dataset
back to the exact software that produced it.

## 6. Canonical data model

### Drug program record

```json
{
  "record_id": "",
  "organization": "",
  "program_name": "",
  "drug_or_compound": null,
  "disease": null,
  "target_or_mechanism": null,
  "development_stage": null,
  "status": null,
  "source_url": "",
  "source_name": "",
  "retrieved_at": "2026-08-22T00:00:00.000Z",
  "evidence_text": "",
  "evidence": {
    "document_url": "",
    "locator": null,
    "content_hash": ""
  },
  "enrichment": {
    "open_targets": null,
    "chembl": null,
    "pubmed": []
  }
}
```

### Field rules

- `organization`, `program_name`, `source_url`, `source_name`, `retrieved_at`, and usable source evidence are required for a releasable record.
- Other scientific fields may be `null` only when the source does not provide them.
- Empty strings are normalized to `null` for nullable fields.
- `retrieved_at` is UTC ISO 8601.
- Raw evidence is preserved verbatim within reasonable size limits.
- Normalization may standardize whitespace, casing, URLs, and controlled vocabularies, but must preserve the original value in provenance when meaning could change.
- Enrichment is namespaced and never silently overwrites scraped claims.

### Competitive candidate record

```json
{
  "candidate_id": "",
  "indication": { "canonical": "", "source_value": "", "aliases": [] },
  "drug_or_program": { "canonical": "", "source_value": "", "aliases": [] },
  "organization": { "canonical": "", "source_value": "", "aliases": [] },
  "attributes": {
    "development_stage": null,
    "status": null,
    "target_or_mechanism": null
  },
  "claims": [],
  "discovery": {
    "query": "",
    "retrieved_at": "2026-08-22T00:00:00.000Z",
    "factory_version": ""
  },
  "validation_verdict": "PENDING"
}
```

### Evidence claim and validation verdict

Every material assertion is represented as a claim containing:

- `claim.id`, subject, predicate, and value.
- Source URL, source type, retrieval time, verbatim evidence text, and a page,
  section, selector, or other resolvable locator when available.
- Content hash and the `factory.version` that extracted it.
- Whether the source is primary, secondary, or an unverified lead.
- Validator verdict: `ACCEPT`, `REJECT`, `AMBIGUOUS`, or `INSUFFICIENT_EVIDENCE`.
- Machine-readable reason, confidence band, checks performed, and reviewing actor.

High-impact claims defined by the brief require at least two independent
sources unless the brief explicitly allows one authoritative primary source.
Mirrors, syndicated press releases, and copies of one underlying document do
not count as independent corroboration.

### Development-stage vocabulary

Initial canonical values:

```text
discovery, preclinical, phase_1, phase_1_2, phase_2,
phase_2_3, phase_3, registration, approved, discontinued, unknown
```

Each source adapter owns an explicit mapping table. Unmapped values become
`unknown`, preserve the source text, and produce a validation warning.

## 7. Source configuration

`config/sources.yaml` is the version-controlled source registry. Each source
must define:

```yaml
- id: dndi
  name: Drugs for Neglected Diseases initiative
  organization: DNDi
  url: https://example.invalid
  acquisition: brightdata
  collector_env: DNDI_COLLECTOR_ID
  enabled: true
  validation:
    history_window: 5
    minimum_records: 1
    maximum_count_drop_ratio: 0.50
    maximum_duplicate_ratio: 0.10
    required_coverage:
      program_name: 1.0
      disease: 0.70
```

Collector IDs and credentials remain in environment variables or ignored local
configuration. Secrets are never stored in this file.

## 8. Factory workflow and state machine

### Software change states

```text
BRIEF_RECEIVED
  → CONTEXT_ASSEMBLED
  → PLAN_READY
  → IMPLEMENTING
  → VERIFYING
  → CHANGE_AWAITING_APPROVAL
  → CHANGE_APPROVED
  → DEPLOYING
  → FACTORY_VERSION_ACTIVE
```

Failure and review states:

```text
IMPLEMENTING or VERIFYING → CHANGE_FAILED → REVISION_REQUESTED
CHANGE_AWAITING_APPROVAL → CHANGE_REJECTED
DEPLOYING → DEPLOYMENT_FAILED → ROLLBACK_REQUIRED
```

Every state transition records `change.id`, actor/agent, timestamp, inputs,
outputs, Git reference, verification evidence, and decision rationale.

### Operational run states

```text
REQUESTED
  → SCRAPING
  → NORMALIZING
  → VALIDATING
  → ENRICHING
  → COMPARING
  → AWAITING_APPROVAL
  → RELEASED
```

Failure and remediation states:

```text
VALIDATING → VALIDATION_FAILED → QUARANTINED → REPAIR_REQUESTED
  → REPAIR_PREVIEW_READY → REPAIR_APPROVED → RE_SCRAPING
  → RE_VALIDATING → AWAITING_APPROVAL

Any human gate → REJECTED or INVESTIGATION_REQUIRED
```

### Software manufacturing workflow

1. Port accepts a new intelligence brief or a runtime repair request.
2. A context step assembles the current brief, source registry, relevant
   adapters, schemas, policies, prior healthy evidence, and repository rules.
3. A planning agent emits a bounded, versioned plan with explicit files,
   tests, risks, and acceptance criteria.
4. A coding agent creates or modifies software only within the approved plan.
5. Verification runs schema, unit, integration, secret, and regression checks;
   live calls remain bounded and use approved credentials.
6. The proposed Git change and evidence are presented in Port. The agent that
   authored the change cannot approve it.
7. Approval deploys an immutable `factory.version`; rejection preserves the
   currently active version.
8. The deployed version executes the operational intelligence loop.
9. A runtime failure may open a new software change with failure evidence as
   context, but it must repeat planning, testing, approval, and deployment.

### Release invariants

- Only an approved, verified software change may become an active factory version.
- Every dataset manifest records the exact `factory.version` that produced it.
- Rejected or failed software changes leave the active factory version unchanged.
- Repair generation is bounded, produces a diff and tests, and cannot mutate a
  live collector or adapter before approval.
- Only a candidate from a passing validation run may enter `AWAITING_APPROVAL`.
- Only an explicit Port approval may transition a candidate to `RELEASED`.
- Rejection keeps the previous healthy release active.
- Failed, repaired, and rejected attempts remain immutable audit records.
- A repair may not change the stable Bright Data Collector ID without an explicit migration decision.
- Retries are bounded and recorded; no stage loops indefinitely.

## 9. Validation specification

Validation produces a machine-readable report with `PASS`, `WARN`, or `FAIL`,
individual checks, observed values, thresholds, and evidence.

### Schema validation

Fail when:

- Output is not a non-empty array.
- A record is structurally invalid.
- Required provenance or identity fields are absent.
- Dates, URLs, or controlled values are malformed beyond safe normalization.

### Historical record-count validation

- Compare against the median of the last configurable `N` healthy releases for the same source and compatible brief.
- Fail on zero records.
- Fail when count drops beyond the source-specific ratio unless an operator-approved explanation exists.
- Warn, rather than automatically fail, when there is insufficient healthy history; `minimum_records` still applies.
- Never hard-code a prior observed count as the permanent expected count.

### Content-quality validation

Check at minimum:

- Required-field coverage.
- Disease, program-name, stage, and status missingness versus recent healthy history.
- Exact and identity-level duplicate ratios.
- Unexpected duplicate explosion.
- Invalid or newly unmapped stage values.
- Evidence presence and evidence/source consistency.
- Material field values collapsing to one suspicious constant.

### Failure isolation

- Validation failure quarantines the entire source artifact for the current candidate.
- The comparison stage must not interpret failed extraction as program removal.
- Other healthy sources may complete processing, but no combined release can bypass the failed-source policy defined by the brief.

### 9.1 Evidence-grounded competitive discovery

Competitive discovery is an optional M4 capability layered on the proven
five-source acquisition and repair foundation. It follows these rules:

1. **Hierarchical decomposition:** indication → organizations/assets → drug or
   program candidates → attributes. Lower-level searches may run in parallel,
   subject to the configured budget.
2. **Explorer/Validator separation:** the Explorer proposes candidates and may
   favor recall; it cannot approve its own outputs. The Validator applies a
   conservative evidence contract and records rejection reasons.
3. **Bounded research:** each candidate has configurable search-query,
   iteration, time, and tool-call budgets. The MVP defaults to no more than
   three reasoning/search iterations and four parallel queries per step.
4. **Structured step summaries:** after each research step, the system stores a
   compact fact/evidence state rather than relying on an ever-growing transcript.
5. **Alias resolution:** deterministic identifiers and dictionaries are used
   first. A language model may propose ambiguous equivalence; uncertain merges
   require analyst review and never erase original names.
6. **Evidence contract:** every accepted candidate and material attribute has
   explicit, recoverable evidence. A search-result snippet alone is not evidence.
7. **Attribute-specific validation:** stage/status, organization, indication,
   target, and mechanism use separate checks. Mechanism-of-action claims require
   stronger evidence or analyst review because they are especially error-prone.
8. **No silent overwrite:** web discovery and enrichment add namespaced claims;
   they do not overwrite a scraped primary-source statement.

### 9.2 Evaluation and deployment gate

- Version prompts, policies, alias dictionaries, schemas, and benchmark datasets
  with the originating `change.id` and resulting `factory.version`.
- Use chronological splits where possible: older reviewed examples for
  development and newer hidden examples for final regression evaluation.
- Report candidate-level precision, recall, and F1 plus attribute-level scores
  and evidence-completeness rate. Dataset limitations and human-labeling policy
  must accompany every score.
- Port blocks deployment when a required evaluation falls below the brief's
  minimum threshold or exceeds its allowed regression budget.
- A language-model judge may assist evaluation but cannot be the sole oracle;
  reviewed examples and deterministic evidence checks are required.
- Exploration results may be visible as leads, but only validator-passing and
  human-approved records may enter a released dataset.

## 10. Scientific enrichment

### Open Targets

- Query disease-associated biological targets using a structured API.
- Store association identifiers, scores where returned, retrieval time, and source URL/identifier.
- Label results as disease associations, never as evidence that the scraped drug acts on the target.

### ChEMBL

- Attempt compound/program cross-reference using exact identifiers first, then normalized names.
- Preserve match method, confidence/reason, ChEMBL identifiers, and relevant bioactivity references.
- `no_match` is an explicit valid result.

### PubMed

- Retrieve a bounded set of relevant papers for program, compound, disease, or target queries.
- Preserve PMID, title, publication date, query, and retrieval time.
- Literature relevance is not proof of a specific program claim.

### Enrichment resilience

- Cache successful structured responses for reproducibility and API stewardship.
- Timeouts or rate limits may produce a partial candidate with warnings only when the brief's release policy permits it.
- Enrichment failures are observable and never converted into fabricated values.

## 11. Change intelligence

Compare only the current passing candidate with the previous healthy release.

Supported change types:

```text
NEW_PROGRAM
REMOVED_PROGRAM
STAGE_CHANGED
STATUS_CHANGED
TARGET_CHANGED
OTHER_MATERIAL_CHANGE
```

Each change record contains old value, new value, canonical record identity,
source evidence for both versions when available, and confidence/review flags.
Ambiguous record matching is sent for review rather than reported as a fact.

## 12. Port specification

### Entities

- Intelligence Brief
- Software Change
- Factory Version
- Organization
- Disease
- Data Source
- Scraper
- Dataset
- Factory Run
- Repair
- Competitor Candidate
- Evidence Claim
- Validation Verdict
- Evaluation Run

### Required relationships

```text
Intelligence Brief tracks Disease
Intelligence Brief requests Software Change
Software Change deploys Factory Version
Disease has_programs_from Organization
Organization publishes Data Source
Data Source collected_by Scraper
Factory Run executes Intelligence Brief
Factory Run uses Factory Version
Factory Run produces Dataset
Factory Run may_trigger Repair
Repair requests Software Change
Repair repairs Scraper
Dataset contains Drug Program records or summary links
Competitor Candidate concerns Disease
Competitor Candidate supported_by Evidence Claim
Competitor Candidate evaluated_by Validation Verdict
Software Change verified_by Evaluation Run
```

### Required workflows

- Assemble a least-privilege context package from a brief or repair request.
- Record a versioned plan and open a linked Git change.
- Track implementation and automated verification evidence.
- Present explicit software-change approval/rejection before deployment.
- Deploy an immutable factory version and preserve rollback evidence.
- Start factory run with brief and source selection.
- Update run/stage status and links to artifacts and SigNoz trace.
- Open remediation on validation failure.
- Record Bright Data repair preview and explicit repair approval/rejection.
- Present candidate release approval/rejection.
- Preserve actor, timestamp, reason, inputs, outputs, and decisions.
- Prevent rejected or unapproved candidates from becoming active releases.
- Prevent rejected or unapproved software changes from becoming active factory versions.
- Present ambiguous aliases, insufficient evidence, and high-impact candidate
  claims for explicit analyst review.
- Block software deployment when required research evaluations regress beyond
  the configured budget.

Port MCP access, if used, must be least-privilege and restricted to authorized
entity reads and workflow actions.

### 12.1 Sponsor tool utilization

| Sponsor tool | Factory responsibility | Required proof |
|---|---|---|
| Bright Data | Acquire approved web sources, execute bounded discovery/validation searches, retain source artifacts, and support scraper repair previews and re-scrapes. | Real terminal-driven scrape; recoverable URLs/evidence; controlled failure and approved repair while retaining the stable Collector ID. |
| Port | Hold briefs, entities, factory/run state, software-change approvals, repair approvals, alias/evidence review, evaluation gates, and final dataset decisions. | An unapproved or rejected software change cannot deploy; an ambiguous or rejected candidate cannot release; actor, rationale, and timestamps are auditable. |
| SigNoz | Observe build, acquisition, research, validation, evaluation, deployment, and repair through correlated OpenTelemetry traces, metrics, logs, dashboards, and alerts. | A reviewer can find a run by `run.id`, identify the source/claim/check that failed, see the active `factory.version`, and follow the repair outcome without terminal output. |

The integrations are complementary rather than interchangeable: Bright Data
provides acquisition and web evidence, Port provides governance and business
state, and SigNoz provides operational truth and diagnosis. Mend remains the
orchestrating software factory and system of record for versioned code and
immutable intelligence artifacts.

## 13. OpenTelemetry and SigNoz specification

### Trace shape

```text
software.change
├── context.assemble
├── plan.generate
├── code.generate
├── tests.execute
├── change.approval
└── factory.deploy

factory.run
├── source.scrape
├── records.normalize
├── research.discover
├── research.search
├── research.summarize
├── alias.resolve
├── candidate.validate
├── records.validate
├── records.enrich.open_targets
├── records.enrich.chembl
├── records.enrich.pubmed
├── dataset.compare
├── repair.request
├── repair.approval
├── source.rescrape
├── records.revalidate
└── release.approval
```

Every span includes applicable `change.id`, `factory.version`, `run.id`,
`source.id`, `dataset.id`, `pipeline.stage`, attempt number, outcome, and record
count.

### Metrics

```text
factory_runs_total
factory_run_duration_ms
software_changes_total
software_change_duration_ms
software_change_verification_failures_total
factory_deployments_total
scrape_duration_ms
scrape_records_extracted
scrape_failures_total
validation_failures_total
repair_attempts_total
repair_success_total
release_decisions_total
discovery_candidates_total
validator_decisions_total
validator_acceptance_ratio
evidence_sources_per_candidate
alias_reviews_total
benchmark_precision
benchmark_recall
benchmark_f1
evaluation_regressions_total
```

Dimensions are bounded to fields such as source, stage, outcome, and failure
class. `run.id` remains available for correlation in traces and logs; production
metric cardinality must be reviewed before retaining it as a metric dimension.

### Structured logs

Logs contain timestamp, severity, message, `trace_id`, `span_id`, `run.id`,
source/stage identifiers, outcome, and a safe error classification. Logs must
not contain credentials, raw authorization headers, or unnecessarily large
source documents.

### Dashboard and alerts

The MVP dashboard shows:

- Run throughput and success/error rate.
- P50/P95 factory and scrape latency.
- Records extracted by source versus recent healthy behavior.
- Validation failures by source/check.
- Candidate discovery volume, validator outcomes, evidence completeness, and ambiguous alias reviews.
- Precision/recall/F1 history by versioned evaluation suite and deployment-blocking regressions.
- Repair attempts and outcomes.
- Latest failed runs with links/pivots to correlated traces and logs.

At least one alert must fire on the controlled record-count collapse and route
to a human or Port remediation path. A reviewer must be able to identify the
failed source, validation rule, observed count, prior baseline, and repair state
from SigNoz alone.

## 14. Application interfaces

### Factory API

Minimum endpoints:

```text
POST /factory/runs
GET  /factory/runs/:runId
GET  /sources
GET  /programs
GET  /changes
GET  /datasets/:datasetId
```

Approval and repair decisions should be initiated through Port. If local API
callbacks are necessary, they require authenticated, idempotent endpoints and
must record the Port workflow/actor reference.

### Minimal UI

The home view shows:

- Total and healthy sources.
- Released program count.
- Material changes in the selected period.
- Recent changes table.
- Drill-down to program, source, evidence, retrieval time, and enrichment.

The UI does not implement operational tracing, alerting, scraper repair, or a
second approval system.

## 15. Artifacts and storage

Each run writes immutable, credential-free artifacts under:

```text
artifacts/factory_runs/<run-id>/
├── manifest.json
├── sources/<source-id>/raw.json
├── sources/<source-id>/normalized.json
├── sources/<source-id>/validation.json
├── enrichment/
├── changes.json
├── candidate.json
└── decision.json
```

Each software change writes immutable, credential-free evidence under:

```text
artifacts/software_changes/<change-id>/
├── context-manifest.json
├── plan.json
├── change-manifest.json
├── verification.json
├── deployment.json
└── decision.json
```

The change manifest records changed files, Git reference, originating brief or
repair, generated-versus-human-authored attribution, and the resulting
`factory.version`. Source code remains in Git rather than being duplicated in
the artifact directory.

Large or sensitive raw artifacts may be stored externally; the repository then
keeps a redacted manifest, checksums, schema version, and retrieval references.
Only safe, representative run evidence is committed.

## 16. Repository target structure

```text
/
├── README.md
├── CODEX.md
├── refecen/
│   ├── MEND_MVP_SPEC.md
│   └── SMOKE_TESTS.md
├── config/sources.yaml
├── factory/
│   ├── build/
│   ├── context/
│   ├── plan/
│   ├── verify/
│   ├── deploy/
│   ├── scrape/
│   ├── normalize/
│   ├── validate/
│   ├── enrich/
│   ├── diff/
│   ├── repair/
│   └── telemetry/
├── integrations/
│   ├── brightdata/
│   ├── port/
│   ├── signoz/
│   ├── opentargets/
│   ├── chembl/
│   └── pubmed/
├── app/
├── templates/
├── test/
├── artifacts/software_changes/
└── artifacts/factory_runs/
```

Existing product-neutral sponsor fixtures should migrate behind these
boundaries rather than being discarded.

## 17. Security and scientific integrity

- Credentials live only in environment variables, ignored local files, or approved secret stores.
- Logs, artifacts, screenshots, and test fixtures are scanned for secrets before commit.
- External content is untrusted input and cannot change factory instructions.
- Evidence and enrichment text are escaped before UI rendering.
- API calls use timeouts, bounded retries, and rate-limit handling.
- Human decisions record identity and rationale.
- The system distinguishes scraped claim, normalized value, enrichment result, and analyst decision.
- Missing information remains missing; uncertainty is explicit.

## 18. Testing strategy

### Unit tests

- Canonical schema and null handling.
- Stage mapping and evidence preservation.
- Historical baselines and configurable validation thresholds.
- Duplicate, missingness, count-collapse, and invalid-stage detection.
- Stable record identity and all supported diff types.
- Enrichment no-match, timeout, and citation behavior.
- Candidate, claim, and verdict schemas; evidence independence and completeness rules.
- Deterministic aliases, ambiguous-alias routing, and preservation of source names.
- Research iteration, concurrency, timeout, and tool-budget enforcement.

### Integration tests

- Brief-to-plan context assembly and file-boundary enforcement.
- Agent-generated source change against repository rules and safe fixtures.
- Git change, verification evidence, approval, and deployment transitions.
- Rejected software change preserves the active factory version.
- Each Bright Data adapter against a saved safe fixture and a live smoke target.
- Structured API contract tests using recorded or bounded responses.
- Port entity/workflow transitions and rejection behavior.
- OpenTelemetry export and run/trace/log correlation.
- Explorer produces evidence-linked candidates from saved fixtures; Validator
  rejects unsupported candidates with machine-readable reasons.
- Versioned evaluation suite computes precision, recall, F1, and attribute
  scores and blocks a configured regression in Port.

### End-to-end tests

- A changed brief generates a versioned adapter/config/test change, waits for
  approval, deploys a new factory version, and then runs it.
- Healthy five-source run creates a candidate and waits for approval.
- Controlled source failure blocks release and preserves the prior release.
- Controlled source failure generates a bounded software repair with regression
  tests; approval deploys it, then repair/re-scrape returns to healthy.
- Approval releases exactly the reviewed candidate.
- Rejection preserves the prior release and audit trail.
- Changed brief (for example, add COPD) reuses the same pipeline.
- Competitive-discovery brief produces broad leads, removes an intentionally
  unsupported candidate, routes an ambiguous alias for review, and releases
  only the exact evidence-backed, approved candidate set.

## 19. Delivery milestones

### M0 — Foundations

- Freeze schema, source registry format, software-change and run artifact
  manifests, both state machines, and telemetry conventions.
- Prove a brief can create a versioned plan, tested change, approval record, and
  immutable local factory version using safe fixtures.
- Select the two small-biotech sources using the criteria in Section 21.

### M1 — One complete source

- Generate or modify the DNDi adapter/config/tests through the software build
  loop, approve and deploy it, then scrape, normalize, validate, artifact, and trace it.
- Historical comparison with one seeded healthy baseline.

### M2 — Failure and repair loop

- One small-biotech source supports controlled breakage.
- Validation blocks the bad candidate.
- Failure evidence generates a reviewable adapter/scraper repair patch and tests.
- Approved Bright Data repair and stable-collector re-scrape work from the terminal.
- Port remediation and approval/rejection are auditable.

### M3 — Full acquisition scope

- Add MMV, GARDP, and the second small biotech.
- Confirm all five source adapters satisfy the same core interfaces.

### M4 — Enrichment and change intelligence

- Add bounded Open Targets, ChEMBL, and PubMed enrichment.
- Produce material change records only between healthy datasets.
- Add bounded Explorer/Validator competitive discovery, alias review, evidence
  claims, and versioned chronological evaluations after M2 is proven.

### M5 — Demo-ready product

- Minimal UI, SigNoz dashboard/alert, Port catalog/workflow, safe artifacts, and scripted 3–5 minute demo.
- Run the complete healthy/failure/repair/reject/approve/changed-brief acceptance suite.

No milestone may expand source or enrichment scope before M2 passes end to end.

## 20. MVP acceptance criteria

The MVP is accepted only when all are demonstrated with real integrations:

1. A brief assembles versioned context and produces a reviewable implementation plan.
2. The factory generates or modifies adapter/configuration/policy/test software within that plan.
3. The proposed software change has a Git reference and machine-readable verification evidence.
4. Human rejection preserves the active factory version; approval deploys the exact reviewed change.
5. The deployed `factory.version` launches a correlated Port Factory Run.
6. Bright Data terminal workflow scrapes a real configured source.
7. Output is normalized to the canonical schema with evidence.
8. Validation detects both healthy and intentionally suspicious results.
9. Structured enrichment preserves citations and uncertainty.
10. Comparison reports material changes only from passing datasets.
11. SigNoz contains correlated build/runtime traces, logs, metrics, and an actionable failure alert.
12. Port shows software change, deployment, run state, remediation, decision, and audit history.
13. A `12 → 0`-style failure is quarantined and cannot replace the healthy release.
14. Failure evidence produces a bounded software repair diff and regression tests.
15. Approved Bright Data repair retains the Collector ID; re-scrape and re-validation visibly recover the source.
16. Human dataset rejection keeps the prior release; approval releases the exact candidate.
17. A changed brief such as `Add COPD programs` manufactures and deploys the required software through the same architecture.
18. The minimal UI shows released intelligence and evidence without duplicating operational dashboards.
19. The repository and committed artifacts contain no credentials.
20. Every accepted competitive candidate and material attribute has recoverable evidence and a validation verdict.
21. Ambiguous aliases and insufficient-evidence candidates cannot silently enter a released dataset.
22. A versioned evaluation suite reports precision, recall, F1, attribute scores, and evidence completeness for applicable software changes.
23. Port blocks a deliberately regressed research-agent or validator version from deployment.
24. Bright Data acquisition, Port governance, and SigNoz observability are all linked by the same `run.id`, `change.id`, and `factory.version` where applicable.

## 21. Open decisions

These are intentionally unresolved and must be decided before their dependent milestone:

| Decision | Due | Selection criteria |
|---|---:|---|
| Small biotech A | M0 | Public pipeline, meaningful unstructured data, stable demo baseline, permitted access, repair scenario feasible |
| Small biotech B | M0 | Complements A in disease/stage/HTML shape without expanding scope |
| Initial disease brief | M0 | Neglected-disease focus with enough records across selected sources |
| Release policy when enrichment is partial | M0 | Explicit per-brief required vs optional enrichment rules |
| Port implementation details | M1 | Native workflow support, approval semantics, least privilege, auditability |
| Artifact persistence backend | M1 | Reproducibility, safe evidence retention, hackathon simplicity |
| Controlled break method | M2 | Realistic, repeatable, safe, and clearly disclosed in the demo |

## 22. Demo evidence checklist

- Port shows the brief and linked `change.id`.
- The context manifest and plan identify the exact files, tests, and acceptance criteria.
- Git shows the generated adapter/configuration/test change.
- Automated verification passes and Port waits for software-change approval.
- Approval deploys an immutable `factory.version`; the subsequent run records it.
- Terminal shows Bright Data run and non-empty source artifact.
- Mend shows normalized records and evidence.
- Port shows brief, entities, relationships, run, and stage history.
- SigNoz shows the healthy run by `run.id`.
- Controlled failure visibly changes a source from healthy count to zero/suspicious count.
- Validation report explains the failure and blocks release.
- SigNoz alert and correlated trace/logs identify the failed source and rule.
- Port remediation links to Bright Data repair preview.
- The agent produces a bounded repair diff and regression test from failure evidence.
- Human approves the repair software, deploys it, then re-scrape recovers the count.
- Human rejects one candidate to prove the prior release remains active.
- Human approves the verified candidate and Mend shows the new release.
- Changed brief adds COPD by manufacturing and deploying a new versioned source change through the same build loop.
- Explorer shows a broad candidate set with bounded search execution and structured summaries.
- Validator rejects one unsupported candidate with a cited reason and routes one ambiguous alias to Port.
- SigNoz shows research, alias-resolution, validation, evidence, and evaluation spans and metrics.
- Port blocks one deliberate evaluation regression and releases only the exact evidence-backed candidate set approved by the analyst.

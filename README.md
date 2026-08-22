# Zero Downtime Factory

Integration-first scaffold for the Zero Downtime Hackathon. The current single-page collector is a neutral fixture used to prove Bright Data Scraper Studio operation while the product idea is still open. Port catalog definitions and the delivery workflow use only product-neutral briefs and normalized integration contracts.

## Port delivery path

The version-controlled Port model is in `port/`. It catalogs project context and replaceable services, accepts a brief/change, records a derived plan, runs build and test stages, and stops at a separate Port-native manual approval action before release. Every local run writes an ignored audit artifact under `artifacts/port/<run-id>/run.json`.

Run the credential-free validation and tests:

```sh
npm ci
npm run port:smoke
npm run port:prepare
npm run port:release
```

See `port/README.md` for the failure/retry/revision drill, Port account setup, and the exact boundary between locally validated artifacts and account-required verification.

## Bright Data setup

1. Copy `.env.example` to `.env.local` and set `BRIGHTDATA_API_KEY`.
2. Install dependencies with `npm install`.
3. Create the smoke collector with `npm run brightdata:create`.
4. Put the returned `c_*` value in `.env.local` as `SCRAPER_STUDIO_COLLECTOR_ID`.
5. Run `npm run brightdata:smoke`.

The validated JSON artifact is written to `artifacts/brightdata/latest.json` and is ignored by Git.

The active implementation target is `MEND_CRITICAL_SLICE_MVP_SPEC.md`: one
SERPINA1/AATD target, three X/Y/Z integrations (pipeline, structural readiness,
and IP activity), and one controlled X-axis failure proving the complete build,
approval, deployment, repair, redeployment, and recovery loop. Broader product
and sponsor specs are retained under `refecen/`. See `CODEX.md` for reusable
Bright Data rules.

## Mend X/Y/Z vertical slice

The browser entry point is now disease-first. Open <http://localhost:3000/mend>,
enter a disease, and Mend retrieves a bounded live Europe PMC corpus plus its
Gene/Protein annotations. It deduplicates papers, preserves source links,
discovers candidate targets, and ranks them using exact supporting and
contradictory passages. A human must select candidates before the application
runs target-specific X/Y/Z diligence against ClinicalTrials.gov, RCSB, and EPO.
No target is fixed in the discovery request.

The discovery APIs are:

```text
POST /mend/discovery/start
POST /mend/discovery/select
POST /mend/discovery/handoff
GET  /mend/discovery
```

The original fixed SERPINA1 lifecycle remains available at `POST /mend/runs`
as a deterministic adapter-break/repair regression demonstration; it is no
longer the product entry point.

Run the deterministic factory lifecycle:

```sh
npm run mend:demo
```

It executes `v1 healthy → X failed while Y/Z remain healthy → v2 recovered`
using saved, credential-free fixtures. Start the API and one-page target view:

```sh
npm start
curl -X POST http://localhost:3000/mend/runs -H "content-type: application/json" -d '{"mode":"normal","runId":"mend-v1-healthy"}'
curl -X POST http://localhost:3000/mend/runs -H "content-type: application/json" -d '{"mode":"break-x","runId":"mend-v1-x-failed"}'
curl -X POST http://localhost:3000/mend/runs -H "content-type: application/json" -d '{"mode":"repaired","runId":"mend-v2-recovered"}'
```

Then open <http://localhost:3000/mend>. Every displayed X/Y/Z result links to
its evidence. X uses a versioned Bright Data-shaped page snapshot, Y supports
bounded live RCSB retrieval, and Z uses an injected patent-source boundary. The
fixture lifecycle proves orchestration and repair; live X and Z acquisition are
separate acceptance steps and must not be represented as completed by fixtures.

### Evidence-to-action diligence workflow

A healthy published Mend run can now create useful follow-up work instead of
ending at an evidence dashboard:

```sh
curl -X POST http://localhost:3000/mend/diligence
```

The workflow derives bounded competitive, structural, and IP signals; proposes
focused diligence; and creates three source-linked review tasks. Each task must
record a reviewer and finding before the final human decision unlocks. The page
at <http://localhost:3000/mend> exposes the same workflow interactively.

The recommendation is decision support only. It is not a target-selection,
clinical, investment, patent-validity, or freedom-to-operate conclusion.

Run the structured Y and Z integrations against live public sources:

```sh
npm run mend:live:structured
```

Y uses the bounded RCSB API. Z uses the EPO Linked Open Data SPARQL endpoint for
occasional, bounded IP-activity lookup and never reports freedom to operate.
For live X acquisition, create a dedicated Beam pipeline collector and save the
returned stable `c_*` identifier as `MEND_X_COLLECTOR_ID` in ignored `.env.local`:

```sh
npm run mend:x:create
npm run mend:x:live
```

Export the three-run Mend lifecycle to the configured SigNoz OTLP endpoint:

```sh
npm run mend:telemetry:smoke
```

Search SigNoz for `mend-v1-healthy`, `mend-v1-x-failed`, and
`mend-v2-recovered` to follow healthy → isolated X failure → recovery.

## SigNoz / OpenTelemetry

The fixture exports OTLP/HTTP traces, structured logs, and metrics without
depending on the eventual product. `src/records.mjs` is the source adapter;
the pipeline only sees normalized `{id, label, sourceUrl, attributes}` records.
One trace contains the `POST /runs` API span, the background/scrape-shaped
pipeline spans, and a shared `run.id`. Logs and metric points carry the same run
ID. No key is required for local SigNoz.

Prerequisites: Node.js 18+, Docker Compose v2 with at least 4 GB available, and
the official `foundryctl`. On Windows, SigNoz recommends Docker Engine in WSL 2.

```sh
npm install
npm test
npm run signoz:up
npm run signoz:verify
npm run telemetry:smoke
```

Open <http://localhost:8080>, finish the local admin bootstrap if prompted, and
search Traces or Logs for one of the exact `run.id` values printed by the smoke
command. Import `observability/signoz/dashboard-v1.json` through **Dashboards →
New dashboard → Import JSON**. The dashboard covers execution rate, P95 latency,
and stage error count. Configure the controlled threshold using
`observability/signoz/ALERT_RUNBOOK.md`; adding a notification destination is an
intentional user-owned UI step because it requires an email/webhook/Port target.

For a manual run, start `npm start`, then call:

```sh
curl -X POST http://localhost:3000/runs -H "content-type: application/json" -d '{"mode":"normal","runId":"demo-normal"}'
curl -X POST http://localhost:3000/runs -H "content-type: application/json" -d '{"mode":"fail","runId":"demo-fail"}'
curl -X POST http://localhost:3000/runs -H "content-type: application/json" -d '{"mode":"recover","runId":"demo-recover"}'
```

`fail` returns HTTP 500 and increments `zero_downtime_stage_failures_total`.
`recover` records the same controlled scrape/schema failure, then first-class
`heal.request`, `heal.approval`, and `scrape.retry` spans before succeeding.
These are a safe orchestration fixture; the real Bright Data `heal` and human
approval commands remain the explicit recovery drill in `CODEX.md`.

To send the same telemetry to SigNoz Cloud, put its OTLP endpoint and
`signoz-ingestion-key=...` header in ignored `.env.local` (see `.env.example`).
Never commit that file. Stop local SigNoz with `npm run signoz:down`; volumes are
preserved.

To verify the hosted SigNoz MCP connection, set `SIGNOZ_URL` to the exact
workspace URL shown in the browser and keep `SIGNOZ_API_KEY` in the user
environment or ignored `.env.local`, then run `npm run signoz:mcp:smoke`.
`SIGNOZ_URL` and `SIGNOZ_MCP_URL` are different values.

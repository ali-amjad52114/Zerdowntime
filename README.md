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

## Meridian — the controlled break surface, and the heal

`mend/` is a fictional biotech pipeline site published as static HTML in four versions,
built to be broken on purpose. It is the source the X axis scrapes and the reason the
repair loop has something real to repair.

Its point is the *kind* of failure it produces. The X/Y/Z fixtures break by renaming a
JSON key, which is loud: the shape changes and anything reading it fails structurally.
Meridian v2 is a routine redesign that merges the phase column into status pills while
every row keeps its data attributes. The scrape returns **HTTP 200 with twenty rows and
no exception**, and one field is quietly gone:

```
v4  rows=20  schema_conformance=1.00  phase_null=0.00  none            -> publish
v2  rows=20  schema_conformance=0.05  phase_null=0.95  selector_drift  -> REPAIR
```

The row count does not move. Nothing that watches error rate, HTTP status or row count
sees this — which is why the alerts key on conformance and never on error rate.

**v4 is the healthy baseline, not v1.** The numbers are Meridian's own release order.
v1 is a source outage (`empty_result`), v3 breaks a field and adds one in the same
release (`upstream_shape_change` → ESCALATE).

### The heal

```sh
npm run mend:heal                 # v4 -> v2: derive, gate, approve, deploy, verify
npm run mend:heal -- --reject     # the interlock: reviewer declines, nothing deploys
npm run mend:heal -- --broken v3  # ambiguous - escalates rather than guessing
npm run mend:heal -- --broken v1  # outage - a selector repair cannot make rows appear
npm run mend:heal -- --reset      # forget the deployed repair and start over
```

The repair is derived from the page rather than selected from a list. A healthy run
stores what each row said, and the synthesizer searches the changed markup for where
those values went, covering rows until every one is explained. On v2 that reaches the
new stage pill for 19 rows and keeps going, because one archived row still renders
through the pre-refresh partial — arriving at the union without being told a union was
needed.

Every candidate then goes through two gates, and the mined hard negatives ride along on
every run so the gates are shown working rather than described:

| Proposal | conformance | numeric bar | validator |
|---|---|---|---|
| derived union | 1.00 | pass | **accept** |
| derived, stopping early | 0.95 | **fail** | reject |
| HN-2 the neighbouring pill | **1.00** | pass | **reject** |
| HN-3 the machine slug | **1.00** | pass | **reject** |

HN-2 and HN-3 are numerically identical to a correct repair and wrong in 20 and 19 rows
out of 20. Only reading the values separates them. HN-1 goes the other way: 0.95 clears
the 0.85 alert threshold while one row in twenty is still wrong.

A repair that passes both gates still has to be approved by someone other than its
author, deployed into the scraper registry, and then **re-measured** — release is decided
by the re-scrape, not by having applied a fix.

Full design, method and stated limitations: [`docs/MEND_HEALING.md`](docs/MEND_HEALING.md).

### Running the site

```sh
npm run site:build             # data/ + templates/ -> mend/versions/{v1,v2,v3,v4}
npm run site:activate v4       # publish the healthy baseline to mend/public/
npm run site:serve             # http://localhost:4173
npm run site:test              # the site's own 75 assertions
```

Over HTTP, with `npm start` running:

```sh
curl -X POST localhost:3000/mend/repair -H 'content-type: application/json' -d '{}'
curl -X POST localhost:3000/mend/runs -H 'content-type: application/json' \
  -d '{"source":"meridian","mode":"break-x"}'
curl localhost:3000/mend/scraper
open http://localhost:3000/mend/repair
```

`{"source":"meridian"}` runs the same X/Y/Z slice with Meridian behind X. When the page
breaks, X goes `STALE_HEALTHY` and keeps serving its last good records while Y and Z stay
published — one source moving a selector must not take the other two down with it.

By default everything above reads the committed `mend/versions/` tree, so it needs no
network, no deployment and no credentials. The deployment is built from that same tree,
so both paths read the same bytes. Set `MEND_MERIDIAN_URL` to scrape the deployed origin
instead.

### Deploying it

The repo root `vercel.json` points at `mend/public`, so a Vercel project on this repo
serves Meridian. That file is also what stops Vercel's zero-config Node detection from
wrapping `src/server.mjs` as a serverless function, which would crash on boot. See
[`mend/README.md`](mend/README.md) for the Edge Config switch that flips which version
`/pipeline` serves without a redeploy.

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

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

## Z sub-axis — orphan exclusivity and vouchers

`src/axes/z/orphan-exclusivity.mjs` sits alongside `z-ip-activity.mjs` and answers the
market-model question a rare disease actually turns on:

- **How long has it been orphaned.** `years_since_designation` is reported for every record,
  approved or not. A designation over ten years old with no approval is flagged `stalled` —
  that is a programme that quietly died, and it is the kind of thing no dashboard surfaces.
- **Whether the exclusivity clock is running.** It only starts on approval, not designation.
  FDA seven years, EMA ten (extendable to twelve on a completed paediatric investigation
  plan). The summary gives `exclusivity_ends` and `exclusivity_years_remaining` per record,
  with states `not started` / `running` / `expired` / `withdrawn`.
- **What a voucher would be worth.** A rare paediatric approval is the event a transferable
  priority review voucher attaches to. `VOUCHER_MARKET` carries publicly reported sale bands
  — roughly $67.5M for the first reported sale, a $350M peak, then a settled nine-figure band
  — with a $100M planning midpoint. Marked `curated: true` and
  `verify_before_relying: true`, because voucher prices surface in filings and press, not an
  API, and the rare paediatric programme has been subject to sunset and reauthorisation.

It follows the same discipline as the IP sub-axis: register facts plus date arithmetic, no
regulatory conclusion. `assertNoUnsupportedRegulatoryClaim` refuses output claiming a voucher
or exclusivity *will* be granted, or that a designation blocks competitors, the same way
`assertNoUnsupportedFtoClaim` refuses freedom-to-operate language.

```sh
node --test test/z-orphan-exclusivity.test.mjs
```

Twelve tests cover all four clock states, EMA vs FDA terms, the stalled signal, field
aliases, and the guardrail.

It runs inside the Z axis of every factory run, with its own record set kept separate from
the IP publications — crowding and market model are different questions — and its own row in
the run trace. Two further sub-axes follow the same pattern: `src/axes/x/site-geography.mjs`
(where the trials actually run) and `src/axes/y/target-identity.mjs` (what the protein is,
how heavy, and where in the cell). Each has a `mendAxisIntegration` entity in
`port/entities/xyz-integrations.json`. None of them is a fourth axis.

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

## The answer view

The one-page view is the factory's test run, not a separate product. Serve it with a run
already in it:

```sh
npm run mend:site                    # healthy v1
npm run mend:site -- --mode lifecycle  # v1 healthy → X failed → v2 recovered
```

Then open <http://localhost:3000/mend>. Opening it before any run renders an empty state that
says how to start one, rather than an error body.

Five panels sit on the three existing axes. There is no fourth axis behind the page:

| Panel | Comes from |
|---|---|
| 1 Target | X pipeline activity + UniProtKB identity |
| 2 Cryo-EM and mass | Y structures (RCSB) + UniProtKB mass and sequence features |
| 3 Subcellular location | Y target identity (`src/axes/y/target-identity.mjs`) |
| 4 Market and CMC | X trial site geography (`src/axes/x/site-geography.mjs`) + curated tables |
| 5 Orphan status and exclusivity | Z orphan register (`src/axes/z/orphan-exclusivity.mjs`) + Z IP activity |

Above the panels is the run trace: every axis and sub-axis with its gate, record count and
whatever its validator reported. A stage that fails its checks is marked degraded, keeps
serving its last healthy snapshot, and its panel says so on its face — so `--mode break-x`
is legible on the page without opening SigNoz.

Four hand-drawn SVG visualisations, no chart library (`src/mend/viz.mjs`): a cell
cross-section that lights up the annotated compartments, trial sites by region with a
single-country concentration flag, a sequence track binning variants into 20-residue windows,
and a resolution plot with the 3.5 Å design-quality line drawn. Each degrades to a caption
when its input is absent, each mark carries a `<title>`, and colours come from CSS variables
so light and dark both work.

Curated tables (`src/mend/reference-tables.mjs`) carry a cited basis and are labelled
**curated** on screen: the cost of the incumbent to beat, and CMC by modality. Modality is
matched from the mechanism text a source reported; a mechanism that names no modality is
listed as unmatched rather than assigned one. Priority review voucher bands additionally
carry **verify before relying** — voucher prices come from filings and press, and the rare
paediatric programme has been subject to sunset and reauthorisation.

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

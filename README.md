# Zero Downtime Factory

Integration-first scaffold for the Zero Downtime Hackathon. The current Hacker News collector is a neutral fixture used to prove Bright Data Scraper Studio operation while the product idea is still open.

## Bright Data setup

1. Copy `.env.example` to `.env.local` and set `BRIGHTDATA_API_KEY`.
2. Install dependencies with `npm install`.
3. Create the smoke collector with `npm run brightdata:create`.
4. Put the returned `c_*` value in `.env.local` as `SCRAPER_STUDIO_COLLECTOR_ID`.
5. Run `npm run brightdata:smoke`.

The validated JSON artifact is written to `artifacts/brightdata/latest.json` and is ignored by Git.

See `SMOKE_TESTS.md` for sponsor acceptance criteria and `CODEX.md` for reusable Bright Data rules.

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

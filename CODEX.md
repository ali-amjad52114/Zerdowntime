# Zero Downtime integration rules

## Bright Data Scraper Studio

- Use the Bright Data CLI from the repository terminal; do not require dashboard operation for a normal scrape run.
- Read `BRIGHTDATA_API_KEY` and `SCRAPER_STUDIO_COLLECTOR_ID` from the environment or ignored `.env.local`; never hardcode or commit credentials.
- Current passing smoke target: `https://example.com`.
- Expected fields: `page_title`, `heading`, `description`, `source_url`.
- Stable passing Collector ID: `c_mt4irkn42411ko4ftk`.
- Run and validate with `npm run brightdata:smoke`.
- The stable Collector ID must be recorded as `SCRAPER_STUDIO_COLLECTOR_ID` in `.env.local` after creation.
- Recovery drill: run the collector, inspect missing/null fields, execute `bdata scraper heal <collector_id> <description> --url <target_url>`, review the preview, approve with `bdata scraper approve`, and rerun the smoke test.

## Integration boundary

The single-page fixture is only an integration smoke test. Application code consumes normalized structured records so the final product source can be swapped without rewriting Port or SigNoz integration.

## SigNoz / OpenTelemetry

- Export OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`; keep optional ingestion headers only in the environment or ignored `.env.local`.
- Preserve `run.id` across API, workflow, source/scrape, retry, logs, and metrics.
- Keep source-specific fields behind `src/records.mjs`; instrumentation belongs around product-neutral stages.
- Use `normal`, `fail`, and `recover` fixture modes for repeatable demos. They must never mutate the real collector or approve a real repair.
- Run `npm test` for deterministic exporter assertions and `npm run telemetry:smoke` for live SigNoz evidence.

## Meridian and the repair loop

- `mend/` is a controlled source. `source.controlled = true` travels in the scrape span
  and the Port entity, not only in the README — the disclosure is part of the data.
- v4 is the healthy baseline. v1 is an outage, v2 is the silent break, v3 is ambiguous.
  The demo runs v4 → v2; the version numbers are Meridian's release order, not ours.
- Alert on `schema_conformance`, never on error rate. A broken run here returns 200 OK
  with the right row count.
- A repair is verified against the pre-break baseline, never against the alert threshold.
  A proposal at 0.95 clears the 0.85 alert and is still wrong in one row of twenty.
- Release needs both gates: numeric bar AND validator. Two of the three mined hard
  negatives are numerically identical to a correct repair, so counting cannot separate
  them. Never report "conformance is back to 1.00" as "the data is right".
- The validator never sees a conformance number. A judge told the number anchors on it.
- Scraper configs are data (`src/mend/selector-plan.mjs`), not closures, so a repair can
  be diffed in review and stored in a Port entity. Every heal bumps `config_version`.
- A deployment requires an approved change id, and the author of a change may not approve
  it. Both are enforced in code, not by convention.
- Default to the committed `mend/versions/` tree. It is the same bytes the deployment is
  built from, so the whole loop rehearses offline with no credentials.

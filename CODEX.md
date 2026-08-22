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

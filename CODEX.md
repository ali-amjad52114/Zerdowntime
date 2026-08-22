# Zero Downtime integration rules

## Bright Data Scraper Studio

- Use the Bright Data CLI from the repository terminal; do not require dashboard operation for a normal scrape run.
- Read `BRIGHTDATA_API_KEY` and `SCRAPER_STUDIO_COLLECTOR_ID` from the environment or ignored `.env.local`; never hardcode or commit credentials.
- Current smoke target: `https://news.ycombinator.com`.
- Expected fields: `title`, `url`, `points`, `author`, `comment_count`.
- Run and validate with `npm run brightdata:smoke`.
- The stable Collector ID must be recorded as `SCRAPER_STUDIO_COLLECTOR_ID` in `.env.local` after creation.
- Recovery drill: run the collector, inspect missing/null fields, execute `bdata scraper heal <collector_id> <description> --url https://news.ycombinator.com`, review the preview, approve with `bdata scraper approve`, and rerun the smoke test.

## Integration boundary

Hacker News is only a smoke-test fixture. Application code should consume normalized structured records so the final product source can be swapped without rewriting Port or SigNoz integration.


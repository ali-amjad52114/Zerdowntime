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

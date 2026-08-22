# Zero Downtime Factory

Integration-first scaffold for the Zero Downtime Hackathon. The current Hacker News collector is a neutral fixture used to prove Bright Data Scraper Studio operation while the product idea is still open. Port catalog definitions and the delivery workflow use only product-neutral briefs and normalized integration contracts.

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

See `SMOKE_TESTS.md` for sponsor acceptance criteria and `CODEX.md` for reusable Bright Data rules.

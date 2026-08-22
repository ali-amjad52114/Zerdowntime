# Bright Data integration evidence

Run date: 2026-08-22

## Passing baseline

- Collector: `c_mt4irkn42411ko4ftk`
- Target: `https://example.com`
- Invocation: `npm run brightdata:smoke`
- Result: passed with one normalized record.
- Required fields populated: `page_title`, `heading`, `description`, `source_url` (1/1 each).
- Raw output: `artifacts/brightdata/raw.json` (ignored).
- Normalized output: `artifacts/brightdata/latest.json` (ignored).

## Controlled failure and repair attempts

The initial Hacker News collector `c_mt4htk0l18cb21jf81` incorrectly followed outbound story links and returned 144 incomplete records with `title`, `url`, and `author` absent.

Two Self-Healing runs were completed against that same Collector ID. Each produced a correct-looking preview, stopped at the approval gate, and was approved. The Collector ID remained stable. Production reruns nevertheless continued the original outbound fan-out and failed the repository validator. This is preserved as honest failure/retry evidence and should be shown to a Bright Data mentor.

A replacement HN collector, `c_mt4ifz0dirhst9tgr`, was created with an explicit one-page/no-follow contract. Its production template also fanned out to outbound links, returning 57 incomplete rows. It is not the configured baseline.

Collector `c_mt4ircei2gdaam94xf` is a half-built attempt against Bright Data's own documentation domain. Bright Data rejected AI generation with `Domain not allowed`, and the CLI reported that deletion is only available in the web UI.

## Remaining Bright Data work

- Connect normalized output to the eventual application feature.
- Ask a Bright Data mentor why approved Self-Healing previews were not reflected in production for the HN collectors.
- Delete the half-built documentation collector in the Bright Data UI if desired.
- Rotate the exposed API key, update ignored `.env.local`, and rerun the passing smoke test.

# Rules for coding agents — zero-downtime-factory

Read `MEND_CRITICAL_SLICE_MVP_SPEC.md` for scope and `CODEX.md` for the Bright Data, SigNoz
and Port integration rules. This file is the short version that applies to every change.

This repo is an **Agentic Software Factory**. The dashboard is the test run; the factory is
the product. A change that makes the output prettier but the loop weaker is a bad change.

## Scope discipline

The MVP is deliberately narrow: **one disease** (alpha-1 antitrypsin deficiency), **one
target** (SERPINA1), **three axes**, one generated software change, one controlled failure,
one repair, two versions, human approval, end-to-end observability.

Do not add: more diseases, competitor discovery, an explorer/validator agent, source
discovery at scale, legal freedom-to-operate analysis, elaborate scoring, a heavy frontend,
production crawling. If a task starts to look like a fourth axis, stop and ask.

## The axis contract

Every axis and sub-axis under `src/axes/` follows the same shape. Match it exactly:

```
normalize<Thing>Records(raw, {sourceName, retrievedAt, subject})  →  canonical records
validate<Thing>Records(records)                                    →  {status, record_count, issues}
summarize<Thing>(records, {now, ...})                              →  summary object
run<Thing>({retrieve, query, sourceName, clock})                   →  {axis, records, summary, validation}
```

- `retrieve` is **injected**, never imported. That is what lets one runner serve a live
  source and a deterministic fixture.
- `clock` is injected too. Never call `new Date()` inside logic a test asserts on.
- Canonical record fields: `id`, `axis`, `subject`, `value`, `source_url`, `retrieved_at`,
  `evidence`, plus `sub_axis` where a sub-axis exists.
- Field aliases from upstream sources are absorbed **in the normalizer only**. Callers never
  see a `sourceUrl` vs `source_url` decision.
- `id` is a sha256 prefix over stable identifying fields, so records dedupe across runs.

## Never infer, never invent

- Missing data stays `null`. Do not fill a sponsor, a date, an assignee or a designation
  from context, and do not let an LLM guess one.
- An empty source response is an **error**, not an empty summary. `validate*` throws.
- Fixtures carry a `fixture_notice` saying they are synthetic. Keep it there.
- If you add a real-world figure — a price, a date, a term — cite it in the same commit.

## Guardrails are load-bearing

`assertNoUnsupportedFtoClaim` (IP activity) and `assertNoUnsupportedRegulatoryClaim`
(orphan exclusivity) refuse output that draws a legal or regulatory conclusion: freedom to
operate, "no blocking patents", "exclusivity will be granted", "blocks all competitors".

These exist because the output looks authoritative and a wrong claim here is worse than no
claim. **Do not weaken a pattern to make a summary read better.** If a legitimate phrasing
trips a guardrail, rephrase the summary, not the guardrail.

Both axes report a signal and state their scope. Neither concludes.

## Credentials and fixtures

- `BRIGHTDATA_API_KEY`, `SCRAPER_STUDIO_COLLECTOR_ID`, OTLP headers: environment or ignored
  `.env.local`. Never hardcoded, never committed.
- Fixture modes (`normal`, `fail`, `recover`) must never mutate a real collector or approve a
  real repair.
- Reuse the pinned collector id from `CODEX.md`. Do not run `bdata scraper create` for a
  source that already has one — duplicates cost money and break the audit trail.

## Observability

- Preserve `run.id` across API, workflow, source/scrape, retry, logs and metrics. A stage
  that does not carry the run id is invisible to the demo.
- Source-specific fields live behind `src/records.mjs`; instrumentation wraps
  product-neutral stages.
- `npm test` must stay deterministic. Live evidence belongs in `npm run telemetry:smoke`.

## Port

The version-controlled model is in `port/`. A new integration needs a `mendAxisIntegration`
entity in `port/entities/xyz-integrations.json` with a real `artifact_path`. Human approval
is a separate Port-native action — never auto-approve a release to make a demo smoother.

Run `npm run port:validate` after any change under `port/`.

## Before you finish

```sh
npm test              # deterministic; must pass
npm run port:smoke    # validate + workflow tests
npm run mend:demo     # v1 healthy → X failed → v2 recovered
```

Commit per completed stage with the stage as the prefix (`scrape:`, `heal:`, `release:`,
`port:`, `signoz:`). The commit history is read by judges.

# Mend validation and source failure alerts

These alerts support operations; they do not replace the live readback evidence
required by `VERIFICATION_RUNBOOK.md`.

Create this rule from **Alerts → New alert → Metrics based alert** (or from the
dashboard's **Stage failures** panel):

- Name: `Zero Downtime controlled pipeline failure`
- Metric: `zero_downtime_stage_failures_total`
- Filter: `pipeline.stage = 'scrape'`
- Aggregate within time series: `increase`
- Aggregate across time series: `sum`
- Condition: above `0` at least once in the last 5 minutes
- Labels: `severity=warning`, `escalation=human-review`

For a demo, set evaluation to one minute, run `npm run telemetry:smoke`, and
show the firing state and alert history. The correlated error log contains
`escalation.target=human-review`, `retry.eligible=true`, and the `run.id`; use
that run ID to pivot between the alert, metric, logs, and trace. Notification
routing is deliberately a UI/account step because it needs a user-owned email,
webhook, Slack channel, or Port endpoint and must not be committed.

## Mend validation failure

- Name: `Mend axis validation failure`
- Metric: `mend_validation_failures_total`
- Group by: `axis`
- Aggregate within time series: `increase`
- Aggregate across time series: `sum`
- Condition: above `0` at least once in the last 5 minutes
- Labels: `severity=warning`, `escalation=human-review`

Pivot from the alert window to an error log, then use `target.run.id`, `axis`,
and `source.execution.id` to locate the matching trace/source execution. If any
of those identifiers is absent, preserve the evidence and fail the correlation
portion of G3.

## Sustained factory failures

- Name: `Mend factory failures sustained`
- Metric: `mend_factory_runs_total`
- Filter: `outcome = 'FAILED'`
- Aggregate within time series: `increase`
- Aggregate across time series: `sum`
- Condition: above `2` in the last 15 minutes
- Labels: `severity=critical`, `escalation=human-review`

Do not configure automatic retries from this alert. Retry authority belongs to
the workflow/Port gate, and every retry must preserve the original target and
source correlation identifiers.
